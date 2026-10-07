import { normalizeJob, type RawJob } from '@jp/core';
import type { Database } from '@jp/db';
import type { AdapterContext, SourceAdapter } from '@jp/scrapers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { failStaleRuns } from '../src/pipeline/expire';
import { getDueQueryIds, getProfile, saveJob } from '../src/pipeline/repository';
import { runQuery } from '../src/pipeline/run-query';
import { syncProfile } from '../src/pipeline/sync-profiles';

const db = getDb();
const now = new Date();
// letters/digits only: keywords must survive the scorer's text normalization unchanged
const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const ctx = {} as AdapterContext;

async function createUser(prefix: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({ email: `${prefix}-${tag}@e2e.test`, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function createQuery(sourceId: string, key: string, nextRunAt: Date, profileId?: string): Promise<string> {
  const { data, error } = await db
    .from('search_queries')
    .insert({ source_id: sourceId, query_key: `${sourceId}:${key}-${tag}`, params: {}, next_run_at: nextRunAt.toISOString() })
    .select('id')
    .single();
  if (error) throw error;
  if (profileId) {
    const { error: linkError } = await db
      .from('search_profile_queries')
      .insert({ search_profile_id: profileId, search_query_id: data.id });
    if (linkError) throw linkError;
  }
  return data.id;
}

async function enableSource(id: string) {
  const { error } = await db.from('sources').update({ enabled: true, paused_until: null, consecutive_empty_runs: 0 }).eq('id', id);
  if (error) throw error;
}

beforeAll(async () => {
  await Promise.all(['djinni', 'remotive', 'dou'].map(enableSource));
});
afterAll(async () => {
  await Promise.all(['djinni', 'remotive', 'dou'].map(enableSource));
});

describe('match refresh (F1)', () => {
  let userId: string;
  let profileId: string;
  const jobIds: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };

  async function profileSync(patch: Database['public']['Tables']['search_profiles']['Update'] = {}) {
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from('search_profiles').update(patch).eq('id', profileId);
      if (error) throw error;
    }
    const profile = await getProfile(db, profileId);
    return syncProfile(db, profile!, now);
  }

  async function matchStates(): Promise<Record<string, string | undefined>> {
    const { data, error } = await db
      .from('job_matches')
      .select('job_id, state, breakdown')
      .eq('user_id', userId)
      .in('job_id', Object.values(jobIds));
    if (error) throw error;
    const byJob = new Map(data.map((m) => [m.job_id, m.state]));
    return { a: byJob.get(jobIds.a), b: byJob.get(jobIds.b), c: byJob.get(jobIds.c) };
  }

  beforeAll(async () => {
    userId = await createUser('refresh');
    const { data, error } = await db
      .from('search_profiles')
      .insert({ user_id: userId, name: 'Refresh', keywords: [`alpha${tag}`] })
      .select('id')
      .single();
    if (error) throw error;
    profileId = data.id;

    const raws: Record<keyof typeof jobIds, { title: string; description: string }> = {
      a: { title: `Alpha${tag} Engineer`, description: 'Golang services' },
      b: { title: `Alpha${tag} Beta${tag} Lead`, description: 'Python' },
      c: { title: `Alpha${tag} Analyst`, description: 'SQL' },
    };
    for (const key of ['a', 'b', 'c'] as const) {
      const job = await normalizeJob({
        ...raws[key],
        externalId: `refresh-${key}-${tag}`,
        url: `https://remotive.com/jobs/${key}-${tag}`,
        company: `Refresh Co ${key} ${tag}`,
      });
      jobIds[key] = (await saveJob(db, 'remotive', job!, now)).jobId;
    }
  });

  it('creates new matches on first sync', async () => {
    await profileSync();
    expect(await matchStates()).toEqual({ a: 'new', b: 'new', c: 'new' });
  });

  it('never resurrects a match the user hid', async () => {
    const { error } = await db.from('job_matches').update({ state: 'hidden' }).eq('user_id', userId).eq('job_id', jobIds.c);
    if (error) throw error;
    await profileSync();
    expect((await matchStates()).c).toBe('hidden');
  });

  it('hides a match when an exclude keyword is added and restores it when removed', async () => {
    await profileSync({ exclude_keywords: ['golang'] });
    expect((await matchStates()).a).toBe('hidden');
    const { data } = await db.from('job_matches').select('breakdown').eq('user_id', userId).eq('job_id', jobIds.a).single();
    expect((data!.breakdown as { excludedBy: string | null }).excludedBy).toBe('golang');

    await profileSync({ exclude_keywords: [] });
    expect(await matchStates()).toEqual({ a: 'new', b: 'new', c: 'hidden' });
  });

  it('refreshes scores of untouched matches', async () => {
    const { error } = await db.from('job_matches').update({ score: 1 }).eq('user_id', userId).eq('job_id', jobIds.b);
    if (error) throw error;
    await profileSync();
    const { data } = await db.from('job_matches').select('score').eq('user_id', userId).eq('job_id', jobIds.b).single();
    expect(data!.score).toBeGreaterThan(1);
  });

  it('drops new matches that no longer score after a keyword edit', async () => {
    await profileSync({ keywords: [`beta${tag}`] });
    expect(await matchStates()).toEqual({ a: undefined, b: 'new', c: 'hidden' });
  });

  it('drops new matches when the profile is deactivated', async () => {
    await profileSync({ is_active: false });
    expect(await matchStates()).toEqual({ a: undefined, b: undefined, c: 'hidden' });
  });

  it('drops new matches when the profile is deleted', async () => {
    await profileSync({ is_active: true, keywords: [`alpha${tag}`] });
    expect(await matchStates()).toEqual({ a: 'new', b: 'new', c: 'hidden' });
    const { error } = await db.from('search_profiles').delete().eq('id', profileId);
    if (error) throw error;
    expect(await matchStates()).toEqual({ a: undefined, b: undefined, c: 'hidden' });
  });
});

describe('dedupe safety (F4, F5)', () => {
  const adapter = (id: 'djinni' | 'remotive', jobs: RawJob[]): SourceAdapter => ({ id, search: async () => jobs });

  it('keeps anonymous postings with the same title apart', async () => {
    const queryId = await createQuery('djinni', 'anon', now);
    const anon = (n: number): RawJob => ({
      externalId: `anon-${n}-${tag}`,
      url: `https://djinni.co/jobs/anon-${n}-${tag}/`,
      title: `Anonymous React Developer ${tag}`,
      company: 'Djinni',
      companyIsPlaceholder: true,
      description: 'React',
    });
    const result = await runQuery(
      { db, adapters: { djinni: adapter('djinni', [anon(1), anon(2)]) }, createContext: () => ctx, now: () => now },
      queryId,
    );
    expect(result).toMatchObject({ status: 'ok', found: 2, inserted: 2 });
    const { data } = await db.from('jobs').select('id').eq('title', `Anonymous React Developer ${tag}`);
    expect(data).toHaveLength(2);
  });

  it('keeps C++, C# and C roles of one company apart', async () => {
    const queryId = await createQuery('remotive', 'langs', now);
    const company = `Langs Co ${tag}`;
    const titles = ['Senior C++ Developer', 'Senior C# Developer', 'Senior C Developer', 'Senior .NET Developer'];
    const jobs = titles.map(
      (title, i): RawJob => ({
        externalId: `lang-${i}-${tag}`,
        url: `https://remotive.com/jobs/lang-${i}-${tag}`,
        title,
        company,
        description: 'Systems work',
        remoteHint: 'remote',
      }),
    );
    const result = await runQuery(
      { db, adapters: { remotive: adapter('remotive', jobs) }, createContext: () => ctx, now: () => now },
      queryId,
    );
    expect(result).toMatchObject({ status: 'ok', inserted: 4 });
    const { data } = await db
      .from('jobs')
      .select('title, title_normalized, companies!inner(name)')
      .eq('companies.name', company);
    expect(data!.map((j) => j.title).sort()).toEqual([...titles].sort());
    expect(data!.find((j) => j.title === 'Senior C++ Developer')!.title_normalized).toBe('senior cplusplus developer');
  });
});

describe('scheduling (F7)', () => {
  let profileId: string;

  beforeAll(async () => {
    const userId = await createUser('schedule');
    const { data, error } = await db
      .from('search_profiles')
      .insert({ user_id: userId, name: 'Schedule', keywords: [`sched${tag}`] })
      .select('id')
      .single();
    if (error) throw error;
    profileId = data.id;
  });

  it('treats a query due within 10 minutes as due and returns its next_run_at', async () => {
    const soon = new Date(now.getTime() + 5 * 60_000);
    const queryId = await createQuery('remotive', 'soon', soon, profileId);
    const due = await getDueQueryIds(db, now, 100_000);
    const row = due.find((q) => q.id === queryId);
    expect(row).toBeDefined();
    expect(new Date(row!.nextRunAt).getTime()).toBe(soon.getTime());
  });

  it('skips a query that is not due without bookkeeping', async () => {
    const later = new Date(now.getTime() + 2 * 3600_000);
    const queryId = await createQuery('remotive', 'later', later, profileId);
    let called = false;
    const remotive: SourceAdapter = {
      id: 'remotive',
      search: async () => {
        called = true;
        return [];
      },
    };
    const result = await runQuery({ db, adapters: { remotive }, createContext: () => ctx, now: () => now }, queryId);
    expect(result.status).toBe('skipped');
    expect(called).toBe(false);
    const { data: runs } = await db.from('source_runs').select('id').eq('query_id', queryId);
    expect(runs).toHaveLength(0);
    const { data: q } = await db.from('search_queries').select('next_run_at').eq('id', queryId).single();
    expect(new Date(q!.next_run_at).getTime()).toBe(later.getTime());
  });
});

describe('failStaleRuns (M2)', () => {
  it('marks runs stuck in running for over an hour as timed out', async () => {
    const queryId = await createQuery('remotive', 'stale', now);
    const { data, error } = await db
      .from('source_runs')
      .insert([
        { source_id: 'remotive', query_id: queryId, started_at: new Date(now.getTime() - 2 * 3600_000).toISOString() },
        { source_id: 'remotive', query_id: queryId, started_at: new Date(now.getTime() - 10 * 60_000).toISOString() },
      ])
      .select('id, started_at')
      .order('started_at');
    if (error) throw error;
    expect(await failStaleRuns(db, now)).toBeGreaterThanOrEqual(1);
    const { data: runs } = await db
      .from('source_runs')
      .select('id, status, error, finished_at')
      .in('id', data.map((r) => r.id))
      .order('started_at');
    expect(runs!.map((r) => [r.status, r.error])).toEqual([
      ['error', 'timed out'],
      ['running', null],
    ]);
    expect(runs![0]!.finished_at).not.toBeNull();
  });
});
