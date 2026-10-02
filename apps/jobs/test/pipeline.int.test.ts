import type { RawJob } from '@jp/core';
import type { AdapterContext, SourceAdapter } from '@jp/scrapers';
import { SourceBlockedError } from '@jp/scrapers';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { expireJobs } from '../src/pipeline/expire';
import { getProfile } from '../src/pipeline/repository';
import { runQuery } from '../src/pipeline/run-query';
import { syncProfile } from '../src/pipeline/sync-profiles';

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
  await db.from('sources').update({ paused_until: null, consecutive_empty_runs: 0, enabled: true }).eq('id', 'dou');
});

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
    await db.from('search_queries').update({ next_run_at: now.toISOString() }).eq('id', douQueryId);
    const deps = { db, adapters: { dou: fakeAdapter(rawJobs) }, createContext: () => ctx, now: () => now };

    const first = await runQuery(deps, douQueryId);
    expect(first).toMatchObject({ status: 'ok', found: 2, inserted: 2 });
    expect(first.matched).toBeGreaterThanOrEqual(1); // other local test users may share this query

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
    const result = await runQuery(deps, douQueryId);
    expect(result.status).toBe('blocked');
    const { data: source } = await db.from('sources').select('paused_until').eq('id', 'dou').single();
    expect(new Date(source!.paused_until!).getTime()).toBeGreaterThan(now.getTime());

    const skipped = await runQuery({ ...deps, adapters: { dou: fakeAdapter(rawJobs) } }, douQueryId);
    expect(skipped.status).toBe('skipped');
    await db.from('sources').update({ paused_until: null }).eq('id', 'dou');
  });

  it('raises an alert after three empty runs in a row', async () => {
    const deps = { db, adapters: { dou: fakeAdapter([]) }, createContext: () => ctx, now: () => now };
    const results = [await runQuery(deps, douQueryId), await runQuery(deps, douQueryId), await runQuery(deps, douQueryId)];
    expect(results.map((r) => r.alert !== null)).toEqual([false, false, true]);
    await db.from('sources').update({ consecutive_empty_runs: 0 }).eq('id', 'dou');
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
