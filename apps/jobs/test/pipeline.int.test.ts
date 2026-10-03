import type { RawJob } from '@jp/core';
import type { AdapterContext, SourceAdapter } from '@jp/scrapers';
import { SourceBlockedError } from '@jp/scrapers';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db';
import { expireJobs } from '../src/pipeline/expire';
import { getDueQueryIds, getProfile } from '../src/pipeline/repository';
import { runQuery } from '../src/pipeline/run-query';
import { syncAllProfiles, syncProfile } from '../src/pipeline/sync-profiles';

const db = getDb();
const now = new Date();
const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const rawJobs: RawJob[] = [
  {
    externalId: `a-${uniq}`,
    url: `https://jobs.dou.ua/vacancies/a-${uniq}/`,
    title: `Senior Full Stack Developer ${uniq}`,
    company: `Acme ${uniq}`,
    description: 'React, Node.js, PostgreSQL. Remote.',
    postedAt: now.toISOString(),
  },
  {
    externalId: `b-${uniq}`,
    url: `https://jobs.dou.ua/vacancies/b-${uniq}/`,
    title: `Accountant ${uniq}`,
    company: `Beta ${uniq}`,
    description: 'Excel and taxes',
  },
];

const fakeAdapter = (jobs: RawJob[] | Error): SourceAdapter => ({
  id: 'dou',
  search: async () => {
    if (jobs instanceof Error) throw jobs;
    return jobs;
  },
});
const ctx = {} as AdapterContext;

let userId: string;
let profileId: string;
let douQueryId: string;
let inactiveProfileId: string;

beforeAll(async () => {
  const { data: user, error } = await db.auth.admin.createUser({ email: `pipe-${uniq}@e2e.test`, email_confirm: true });
  if (error) throw error;
  userId = user.user.id;
  const { data: sp, error: spError } = await db
    .from('search_profiles')
    .insert({ user_id: userId, name: 'Full stack', keywords: ['full stack'], skills: ['React', 'Node.js'], remote_type: 'remote' })
    .select('id')
    .single();
  if (spError) throw spError;
  profileId = sp.id;
  await resetDou();
});

async function resetDou() {
  const { error } = await db
    .from('sources')
    .update({ paused_until: null, consecutive_empty_runs: 0, enabled: true })
    .eq('id', 'dou');
  if (error) throw error;
}

// runQuery drops runs of a query that is not due (a duplicate enqueue); each test run is a fresh scheduled one.
async function makeDue(queryId: string) {
  const { error } = await db.from('search_queries').update({ next_run_at: now.toISOString() }).eq('id', queryId);
  if (error) throw error;
}

// Restore DOU health even when an assertion fails, so a failed run can't leave the source paused.
afterEach(resetDou);
afterAll(resetDou);

describe('syncProfile', () => {
  it('creates and links per-source queries for a profile', async () => {
    const profile = await getProfile(db, profileId);
    const { queryIds } = await syncProfile(db, profile!, now);
    expect(queryIds.length).toBeGreaterThan(5);
    const { data } = await db
      .from('search_queries')
      .select('id, source_id, params')
      .in('id', queryIds)
      .eq('source_id', 'dou');
    expect(data).toHaveLength(1);
    douQueryId = data![0]!.id;
  });
});

describe('runQuery', () => {
  it('saves relevant jobs, dedupes on re-run and creates matches', async () => {
    const deps = { db, adapters: { dou: fakeAdapter(rawJobs) }, createContext: () => ctx, now: () => now };

    await makeDue(douQueryId);
    const first = await runQuery(deps, douQueryId);
    expect(first).toMatchObject({ status: 'ok', found: 2, inserted: 2 });
    expect(first.matched).toBeGreaterThanOrEqual(1); // other local test users may share this query

    await makeDue(douQueryId);
    const second = await runQuery(deps, douQueryId);
    expect(second).toMatchObject({ status: 'ok', found: 2, inserted: 0 });

    // Scope to this run's jobs: syncProfile backfills matches from earlier runs' still-active jobs.
    const { data: matches } = await db
      .from('job_matches')
      .select('score, state, jobs!inner(title)')
      .eq('user_id', userId)
      .like('jobs.title', `%${uniq}`);
    expect(matches).toHaveLength(1);
    expect(matches![0]!.score).toBeGreaterThan(50);

    const { data: postings } = await db.from('job_postings').select('id').eq('external_id', `a-${uniq}`);
    expect(postings).toHaveLength(1);
  });

  it('dedupes the same job seen on another source by fingerprint', async () => {
    const { data: q } = await db
      .from('search_queries')
      .upsert({ source_id: 'remotive', query_key: `remotive:test-${uniq}`, params: {} }, { onConflict: 'query_key' })
      .select('id')
      .single();
    const remotive: SourceAdapter = { ...fakeAdapter([{ ...rawJobs[0]!, externalId: `r-${uniq}`, url: `https://remotive.com/x/${uniq}` }]), id: 'remotive' };
    const result = await runQuery({ db, adapters: { remotive }, createContext: () => ctx, now: () => now }, q!.id);
    expect(result.inserted).toBe(0);
    const { data: job } = await db.from('jobs').select('id, job_postings(source_id)').eq('title', rawJobs[0]!.title).single();
    expect(job!.job_postings.map((p) => p.source_id).sort()).toEqual(['dou', 'remotive']);
  });

  it('pauses the source when it blocks us', async () => {
    const deps = { db, adapters: { dou: fakeAdapter(new SourceBlockedError(429, 'https://x')) }, createContext: () => ctx, now: () => now };
    await makeDue(douQueryId);
    const result = await runQuery(deps, douQueryId);
    expect(result.status).toBe('blocked');
    const { data: source } = await db.from('sources').select('paused_until').eq('id', 'dou').single();
    expect(new Date(source!.paused_until!).getTime()).toBeGreaterThan(now.getTime());

    await makeDue(douQueryId);
    const skipped = await runQuery({ ...deps, adapters: { dou: fakeAdapter(rawJobs) } }, douQueryId);
    expect(skipped.status).toBe('skipped');
    const { data: q } = await db.from('search_queries').select('next_run_at').eq('id', douQueryId).single();
    expect(new Date(q!.next_run_at).getTime()).toBe(new Date(source!.paused_until!).getTime());
  });

  it('raises an alert after three empty runs in a row', async () => {
    const deps = { db, adapters: { dou: fakeAdapter([]) }, createContext: () => ctx, now: () => now };
    const results = [];
    for (let i = 0; i < 3; i++) {
      await makeDue(douQueryId);
      results.push(await runQuery(deps, douQueryId));
    }
    expect(results.map((r) => r.alert !== null)).toEqual([false, false, true]);
  });

  it('skips an unconfigured adapter and moves the query forward', async () => {
    await makeDue(douQueryId);
    const unconfigured: SourceAdapter = { ...fakeAdapter(rawJobs), isConfigured: () => false };
    const result = await runQuery({ db, adapters: { dou: unconfigured }, createContext: () => ctx, now: () => now }, douQueryId);
    expect(result.status).toBe('skipped');
    const { data: q } = await db.from('search_queries').select('next_run_at').eq('id', douQueryId).single();
    expect(new Date(q!.next_run_at).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('getDueQueryIds', () => {
  it('returns due queries of active profiles only, on enabled unpaused sources', async () => {
    const { data: inactive, error } = await db
      .from('search_profiles')
      .insert({ user_id: userId, name: 'Inactive', keywords: [`inactive-${uniq}`], is_active: false })
      .select('id')
      .single();
    if (error) throw error;
    inactiveProfileId = inactive.id;
    const past = new Date(now.getTime() - 60_000).toISOString();
    const { data: queries, error: qError } = await db
      .from('search_queries')
      .insert([
        { source_id: 'remotive', query_key: `remotive:inactive-${uniq}`, params: {}, next_run_at: past },
        { source_id: 'remotive', query_key: `remotive:active-${uniq}`, params: {}, next_run_at: past },
      ])
      .select('id, query_key');
    if (qError) throw qError;
    const inactiveQ = queries.find((q) => q.query_key.includes('inactive'))!.id;
    const activeQ = queries.find((q) => !q.query_key.includes('inactive'))!.id;
    const { error: linkError } = await db.from('search_profile_queries').insert([
      { search_profile_id: inactive.id, search_query_id: inactiveQ },
      { search_profile_id: profileId, search_query_id: activeQ },
    ]);
    if (linkError) throw linkError;

    const due = (await getDueQueryIds(db, now, 100_000)).map((q) => q.id);
    expect(due).toContain(activeQ);
    expect(due).not.toContain(inactiveQ);

    await db.from('sources').update({ paused_until: new Date(now.getTime() + 3600_000).toISOString() }).eq('id', 'remotive');
    try {
      expect((await getDueQueryIds(db, now, 100_000)).map((q) => q.id)).not.toContain(activeQ);
    } finally {
      await db.from('sources').update({ paused_until: null }).eq('id', 'remotive');
    }
  });
});

describe('syncAllProfiles', () => {
  it('unlinks queries of inactive profiles', async () => {
    await syncAllProfiles(db, now);
    const { data } = await db.from('search_profile_queries').select('search_query_id').eq('search_profile_id', inactiveProfileId);
    expect(data).toHaveLength(0);
  });
});

describe('expireJobs', () => {
  it('expires jobs not seen for 14 days', async () => {
    const old = new Date(now.getTime() - 15 * 24 * 3600 * 1000).toISOString();
    await db.from('jobs').update({ last_seen_at: old }).eq('title', rawJobs[1]!.title);
    expect(await expireJobs(db, now)).toBeGreaterThanOrEqual(1);
    const { data } = await db.from('jobs').select('status').eq('title', rawJobs[1]!.title).single();
    expect(data!.status).toBe('expired');
  });
});

describe('browser sources and source selection', () => {
  it('disposes the adapter context after a run, even on error', async () => {
    const dispose = vi.fn(async () => {});
    const failing: SourceAdapter = { id: 'dou', search: async () => { throw new Error('boom'); } };
    const deps = { db, adapters: { dou: failing }, createContext: () => ({ ...ctx, dispose }), now: () => now };
    await makeDue(douQueryId);
    await expect(runQuery(deps, douQueryId)).rejects.toThrow('boom');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('only links queries for the sources the profile selected', async () => {
    const { data: sp, error } = await db
      .from('search_profiles')
      .insert({ user_id: userId, name: 'UA only', keywords: ['react'], sources: ['dou', 'workua'] })
      .select('id')
      .single();
    if (error) throw error;
    try {
      const profile = await getProfile(db, sp.id);
      const { queryIds } = await syncProfile(db, profile!, now);
      const { data } = await db.from('search_queries').select('source_id').in('id', queryIds);
      expect([...new Set(data!.map((q) => q.source_id))].sort()).toEqual(['dou', 'workua']);
    } finally {
      await db.from('search_profiles').delete().eq('id', sp.id);
    }
  });

  it('links queries whose key contains commas and quotes (multi-param params), so they become due', async () => {
    const { data: sp, error } = await db
      .from('search_profiles')
      .insert({ user_id: userId, name: 'LI remote', keywords: [`react${uniq}`], remote_type: 'remote', sources: ['linkedin', 'workua'] })
      .select('id')
      .single();
    if (error) throw error;
    try {
      const profile = await getProfile(db, sp.id);
      const { queryIds } = await syncProfile(db, profile!, now);
      expect(queryIds).toHaveLength(2); // linkedin + workua(remote) both have multi-param keys
      const { data } = await db.from('search_queries').select('id').in('id', queryIds);
      await db.from('search_queries').update({ next_run_at: now.toISOString() }).in('id', queryIds);
      const due = (await getDueQueryIds(db, now, 5000)).map((q) => q.id);
      for (const q of data!) expect(due).toContain(q.id);
    } finally {
      await db.from('search_profiles').delete().eq('id', sp.id);
    }
  });
});
