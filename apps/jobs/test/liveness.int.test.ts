import type { AdapterContext, SourceAdapter } from '@jp/scrapers';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { checkLiveness } from '../src/pipeline/liveness';

const db = getDb();
const uniq = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let userId = '';
let companyId = '';

afterAll(async () => {
  await db.from('jobs').delete().like('fingerprint', `live-%-${uniq}`);
  if (companyId) await db.from('companies').delete().eq('id', companyId);
  if (userId) await db.auth.admin.deleteUser(userId);
});

async function seed(marker: string): Promise<string> {
  const { data: job, error } = await db.from('jobs').insert({ fingerprint: `live-${marker}-${uniq}`, title: `Frontend ${marker}`, company_id: companyId }).select('id').single();
  if (error) throw error;
  await db.from('job_postings').insert({ job_id: job.id, source_id: 'djinni', external_id: `live-${marker}-${uniq}`, url: `https://djinni.co/jobs/${marker}-${uniq}/` });
  await db.from('job_matches').insert({ user_id: userId, job_id: job.id, score: 70, state: 'new', breakdown: {} });
  return job.id;
}

describe('checkLiveness', () => {
  it('expires closed postings, keeps open and unknown ones, and records the check', async () => {
    const { data: user, error } = await db.auth.admin.createUser({ email: `live-${uniq}@e2e.test`, email_confirm: true });
    if (error) throw error;
    userId = user.user.id;
    const { data: company } = await db.from('companies').insert({ name: `Live ${uniq}`, normalized_name: `live ${uniq}` }).select('id').single();
    companyId = company!.id;
    const ids = { open: await seed('open'), closed: await seed('closed'), unknown: await seed('unknown') };

    const djinni: SourceAdapter = {
      id: 'djinni',
      search: async () => [],
      isOpen: async (url) => (url.includes('/closed-') ? false : url.includes('/open-') ? true : null),
    };
    const result = await checkLiveness(db, { adapters: { djinni }, createContext: () => ({}) as AdapterContext, onlyJobIds: Object.values(ids) });
    expect(result).toEqual({ checked: 3, closed: 1, unknown: 1 });

    const { data: rows } = await db.from('jobs').select('id, status, live_checked_at').in('id', Object.values(ids));
    const row = (id: string) => rows!.find((r) => r.id === id)!;
    expect(row(ids.closed).status).toBe('expired');
    expect(row(ids.open)).toMatchObject({ status: 'active' });
    expect(row(ids.open).live_checked_at).not.toBeNull();
    expect(row(ids.unknown)).toMatchObject({ status: 'active', live_checked_at: null });
  });
});
