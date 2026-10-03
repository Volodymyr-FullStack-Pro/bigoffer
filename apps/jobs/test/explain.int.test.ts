import { FakeLlmClient } from '@jp/ai/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { explainTopMatches, type ExplainDeps } from '../src/pipeline/explain';

const db = getDb();
const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let userId: string;
const jobIds: Record<string, string> = {};

const llm = new FakeLlmClient((req) => {
  const numbers = [...req.prompt.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]));
  return { items: numbers.map((n) => ({ n, why: `Причина ${n}` })) };
});
const deps = (over: Partial<ExplainDeps> = {}): ExplainDeps => ({
  db,
  llm,
  dailyLimit: 1_000_000,
  minIntervalMs: 0,
  onlyUserIds: [userId],
  ...over,
});

async function explanationOf(key: string) {
  const { data, error } = await db
    .from('job_matches')
    .select('explanation, explained_at')
    .eq('user_id', userId)
    .eq('job_id', jobIds[key]!)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  const { data: user, error } = await db.auth.admin.createUser({ email: `explain-${uniq}@e2e.test`, email_confirm: true });
  if (error) throw error;
  userId = user.user.id;
  await db.from('profiles').update({ locale: 'uk' }).eq('id', userId);
  const { data: sp } = await db
    .from('search_profiles')
    .insert({ user_id: userId, name: 'FE', keywords: ['frontend'], skills: ['React'], remote_type: 'remote', sources: ['dou'] })
    .select('id')
    .single();
  const { data: company } = await db
    .from('companies')
    .insert({ name: `Explain ${uniq}`, normalized_name: `explain ${uniq}` })
    .select('id')
    .single();
  const jobs: [string, number, boolean][] = [
    ['top', 90, true],
    ['second', 80, true],
    ['third', 70, true],
    ['low', 40, true],
    ['raw', 95, false],
  ];
  for (const [key, score, enriched] of jobs) {
    const { data: job, error: jobError } = await db
      .from('jobs')
      .insert({
        fingerprint: `explain-${key}-${uniq}`,
        title: `Frontend ${key} ${uniq}`,
        company_id: company!.id,
        remote_type: 'remote',
        skills: ['React'],
        summary: { en: `About ${key}.` },
        is_job: enriched ? true : null,
        enriched_at: enriched ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    if (jobError) throw jobError;
    jobIds[key] = job.id;
    const { error: matchError } = await db.from('job_matches').insert({
      user_id: userId,
      job_id: job.id,
      search_profile_id: sp!.id,
      score,
      breakdown: { matchedSkills: ['React'] },
    });
    if (matchError) throw matchError;
  }
});

describe('explainTopMatches', () => {
  it('explains the best enriched matches in the user language within the daily budget', async () => {
    const result = await explainTopMatches(deps({ perUserLimit: 2 }));
    expect(result).toMatchObject({ status: 'ok', explained: 2, requests: 1 });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.prompt).toContain(`Frontend top ${uniq}`);
    expect((await explanationOf('top')).explanation).toEqual({ uk: 'Причина 1' });
    expect((await explanationOf('second')).explanation).toEqual({ uk: 'Причина 2' });
    expect((await explanationOf('raw')).explained_at).toBeNull();
  });

  it('does not exceed the per-user daily budget on a second run', async () => {
    const before = llm.calls.length;
    const result = await explainTopMatches(deps({ perUserLimit: 2 }));
    expect(result).toMatchObject({ status: 'ok', explained: 0, requests: 0 });
    expect(llm.calls).toHaveLength(before);
  });

  it('skips low scores and unenriched jobs', async () => {
    const result = await explainTopMatches(deps());
    expect(result).toMatchObject({ explained: 1 });
    expect((await explanationOf('third')).explanation).toEqual({ uk: 'Причина 1' });
    expect((await explanationOf('low')).explained_at).toBeNull();
    expect((await explanationOf('raw')).explained_at).toBeNull();
  });

  it('reports a missing key without touching anything', async () => {
    expect(await explainTopMatches(deps({ llm: new FakeLlmClient(() => ({ items: [] }), []) }))).toMatchObject({
      status: 'unavailable',
      explained: 0,
    });
  });
});
