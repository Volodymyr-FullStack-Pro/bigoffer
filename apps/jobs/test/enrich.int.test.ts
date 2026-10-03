import { LlmRateLimitError } from '@jp/ai';
import { FakeLlmClient, type FakeRequest } from '@jp/ai/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { getAiRequestsToday } from '../src/pipeline/ai-repository';
import { enrichJobs, type EnrichDeps } from '../src/pipeline/enrich';
import { matchJobs } from '../src/pipeline/match';
import { getProfile, getScorableJobs } from '../src/pipeline/repository';

const db = getDb();
const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let userId: string;
let profileId: string;
let companyId: string;

const aiOutput = (over: Record<string, unknown> = {}) => ({
  is_job: true,
  role: 'Full Stack Developer',
  seniority: 'middle',
  skills: ['React', 'Kafka'],
  salary: { min: 3000, max: 4000, currency: 'USD', period: 'month' },
  remote_type: 'remote',
  remote_regions: ['europe'],
  lang: 'en',
  summary: { en: 'Builds a payments platform.', uk: 'Будує платіжну платформу.', ru: 'Строит платёжную платформу.' },
  ...over,
});

/** Inserts an active DOU job and lets the real matcher create this user's match for it. */
async function seedJob(marker: string, patch: Record<string, unknown> = {}): Promise<string> {
  const { data: job, error } = await db
    .from('jobs')
    .insert({
      fingerprint: `enrich-${marker}-${uniq}`,
      title: `Full Stack Developer ${marker}-${uniq}`,
      company_id: companyId,
      description_text: 'We use React. Remote.',
      remote_type: 'remote',
      ...patch,
    })
    .select('id')
    .single();
  if (error) throw error;
  const { error: postingError } = await db
    .from('job_postings')
    .insert({ job_id: job.id, source_id: 'dou', external_id: `enrich-${marker}-${uniq}`, url: `https://jobs.dou.ua/vacancies/${marker}-${uniq}/` });
  if (postingError) throw postingError;
  const profile = (await getProfile(db, profileId))!;
  await matchJobs(db, [profile], await getScorableJobs(db, [job.id]));
  return job.id;
}

async function matchOf(jobId: string) {
  const { data, error } = await db
    .from('job_matches')
    .select('score, state, breakdown')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as {
    score: number;
    state: string;
    breakdown: { matchedSkills: string[]; excludedBy: string | null; blockedRegions: string[] | null };
  } | null;
}

const markerOf = (req: FakeRequest) => req.prompt.match(/Full Stack Developer (\w+)-/)?.[1] ?? '';
const deps = (llm: FakeLlmClient, onlyJobIds: string[], over: Partial<EnrichDeps> = {}): EnrichDeps => ({
  db,
  llm,
  dailyLimit: 1_000_000,
  batchSize: 10,
  minIntervalMs: 0,
  onlyJobIds,
  ...over,
});

beforeAll(async () => {
  const { data: user, error } = await db.auth.admin.createUser({ email: `enrich-${uniq}@e2e.test`, email_confirm: true });
  if (error) throw error;
  userId = user.user.id;
  const { error: countryError } = await db.from('profiles').update({ country: 'UA' }).eq('id', userId);
  if (countryError) throw countryError;
  const { data: sp, error: spError } = await db
    .from('search_profiles')
    .insert({ user_id: userId, name: 'FS', keywords: ['full stack'], skills: ['React', 'Kafka'], remote_type: 'remote', sources: ['dou'] })
    .select('id')
    .single();
  if (spError) throw spError;
  profileId = sp.id;
  const { data: company, error: cError } = await db
    .from('companies')
    .insert({ name: `Enrich ${uniq}`, normalized_name: `enrich ${uniq}` })
    .select('id')
    .single();
  if (cError) throw cError;
  companyId = company.id;
});

describe('enrichJobs', () => {
  it('enriches matched jobs, fills only gaps, and rescores', async () => {
    const ids = {
      gap: await seedJob('gap'),
      keep: await seedJob('keep', { seniority: 'senior', salary_min_usd: 5000, salary_max_usd: 6000 }),
      course: await seedJob('course'),
      usonly: await seedJob('usonly'),
    };
    const before = await matchOf(ids.gap);
    expect(before?.breakdown.matchedSkills).toEqual(['React']);

    const llm = new FakeLlmClient((req) => {
      const marker = markerOf(req);
      if (marker === 'course') return aiOutput({ is_job: false });
      if (marker === 'usonly') return aiOutput({ remote_regions: ['us'] });
      if (marker === 'keep') return aiOutput({ seniority: 'junior', salary: { min: 1000, max: null, currency: 'USD', period: 'month' } });
      return aiOutput();
    });
    const result = await enrichJobs(deps(llm, Object.values(ids)));
    expect(result).toMatchObject({ status: 'ok', enriched: 4, notJobs: 1, failed: 0 });
    expect(llm.calls.every((c) => c.sensitivity === 'public')).toBe(true);

    const { data: rows } = await db
      .from('jobs')
      .select('id, role, skills, summary, seniority, salary_min_usd, salary_max_usd, is_job, remote_regions, enriched_at, lang')
      .in('id', Object.values(ids));
    const row = (id: string) => rows!.find((r) => r.id === id)!;
    expect(row(ids.gap)).toMatchObject({ role: 'Full Stack Developer', skills: ['React', 'Kafka'], seniority: 'middle', salary_min_usd: 3000, salary_max_usd: 4000, is_job: true, lang: 'en' });
    expect((row(ids.gap).summary as { en: string }).en).toBe('Builds a payments platform.');
    expect(row(ids.gap).enriched_at).not.toBeNull();
    expect(row(ids.keep)).toMatchObject({ seniority: 'senior', salary_min_usd: 5000, salary_max_usd: 6000 });
    expect(row(ids.course).is_job).toBe(false);

    const after = await matchOf(ids.gap);
    expect(after!.breakdown.matchedSkills).toEqual(['React', 'Kafka']);
    expect(after!.score).toBeGreaterThan(before!.score);
    expect(await matchOf(ids.course)).toBeNull();
    const blocked = await matchOf(ids.usonly);
    expect(blocked).toMatchObject({ state: 'hidden', breakdown: { excludedBy: 'region', blockedRegions: ['us'] } });

    const scorable = await getScorableJobs(db, [ids.course, ids.usonly]);
    expect(scorable.find((s) => s.jobId === ids.course)!.job.isJob).toBe(false);
    expect(scorable.find((s) => s.jobId === ids.usonly)!.job.remoteRegions).toEqual(['us']);
    expect(await getAiRequestsToday(db, new Date(), 'public')).toBeGreaterThanOrEqual(4);
  });

  it('stops on a rate limit without penalising the remaining job', async () => {
    const ids = [await seedJob('rl1'), await seedJob('rl2')];
    let calls = 0;
    const llm = new FakeLlmClient(() => {
      calls += 1;
      if (calls === 2) throw new LlmRateLimitError('quota exceeded', 30_000);
      return aiOutput();
    });
    const result = await enrichJobs(deps(llm, ids));
    expect(result).toMatchObject({ status: 'rate_limited', enriched: 1, retryAfterMs: 30_000 });
    const { data } = await db.from('jobs').select('enriched_at, enrich_attempts').in('id', ids);
    expect(data!.filter((j) => j.enriched_at !== null)).toHaveLength(1);
    expect(data!.find((j) => j.enriched_at === null)!.enrich_attempts).toBe(0);
  });

  it('counts a failed attempt on invalid output', async () => {
    const id = await seedJob('bad');
    const result = await enrichJobs(deps(new FakeLlmClient(() => ({ nonsense: true })), [id]));
    expect(result).toMatchObject({ status: 'ok', enriched: 0, failed: 1 });
    const { data } = await db.from('jobs').select('enriched_at, enrich_attempts, enrich_error').eq('id', id).single();
    expect(data).toMatchObject({ enriched_at: null, enrich_attempts: 1 });
    expect(data!.enrich_error).toContain('schema');
  });

  it('respects the daily limit and a missing key', async () => {
    const id = await seedJob('limit');
    const used = await getAiRequestsToday(db, new Date(), 'public');
    const llm = new FakeLlmClient(() => aiOutput());
    expect(await enrichJobs(deps(llm, [id], { dailyLimit: used }))).toMatchObject({ status: 'daily_limit', enriched: 0 });
    expect(await enrichJobs(deps(new FakeLlmClient(() => aiOutput(), []), [id]))).toMatchObject({ status: 'unavailable' });
    expect(llm.calls).toHaveLength(0);
  });
});
