import type { SourceAdapter } from '@jp/scrapers';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { discoverBoards, getEnabledBoards, recordBoardRun } from '../src/pipeline/boards';

const db = getDb();
const uniq = `${Date.now()}`.slice(-8);
const slug = `testco${uniq}`;

afterAll(async () => {
  await db.from('source_boards').delete().like('slug', `%${uniq}%`);
  await db.from('job_postings').delete().eq('external_id', `boards-${uniq}`);
  await db.from('jobs').delete().like('fingerprint', `boards-${uniq}%`);
  await db.from('companies').delete().eq('normalized_name', `boards ${uniq}`);
});

describe('source boards', () => {
  it('lists enabled seed boards', async () => {
    const boards = await getEnabledBoards(db);
    expect(boards).toEqual(
      expect.arrayContaining([
        { sourceId: 'greenhouse', slug: 'gitlab' },
        { sourceId: 'telegram', slug: 'job_it_junior' },
      ]),
    );
  });

  it('disables a board after three failures and resets on success', async () => {
    await db.from('source_boards').insert({ source_id: 'lever', slug, origin: 'discovered' });
    await recordBoardRun(db, 'lever', slug, false);
    await recordBoardRun(db, 'lever', slug, true);
    for (let i = 0; i < 3; i++) await recordBoardRun(db, 'lever', slug, false);
    const { data } = await db.from('source_boards').select('enabled, failures').eq('source_id', 'lever').eq('slug', slug).single();
    expect(data).toEqual({ enabled: false, failures: 3 });
  });

  it('discovers a new board from a posting link and verifies it', async () => {
    const found = `found${uniq}`;
    const { data: company } = await db.from('companies').insert({ name: `B ${uniq}`, normalized_name: `boards ${uniq}` }).select('id').single();
    const { data: job } = await db
      .from('jobs')
      .insert({ fingerprint: `boards-${uniq}`, title: 'Frontend Engineer', company_id: company!.id, description_text: `Apply: https://jobs.ashbyhq.com/${found}/abc` })
      .select('id')
      .single();
    await db.from('job_postings').insert({ job_id: job!.id, source_id: 'remotive', external_id: `boards-${uniq}`, url: 'https://remotive.com/x' });
    const ashby: SourceAdapter = {
      id: 'ashby',
      search: async (p) => (p.board === found ? [{ externalId: '1', url: 'https://jobs.ashbyhq.com/x/1', title: 'Frontend Engineer', company: 'X' }] : []),
    };
    const res = await discoverBoards(db, { adapters: { ashby }, createContext: () => ({}) as never });
    expect(res.added).toBeGreaterThanOrEqual(1);
    const { data } = await db.from('source_boards').select('origin, enabled').eq('source_id', 'ashby').eq('slug', found).single();
    expect(data).toEqual({ origin: 'discovered', enabled: true });
  });

  it('remembers a failed candidate as disabled and does not re-check it', async () => {
    const dead = `dead${uniq}`;
    const { data: company } = await db.from('companies').select('id').eq('normalized_name', `boards ${uniq}`).single();
    const { data: job } = await db
      .from('jobs')
      .insert({ fingerprint: `boards-${uniq}-dead`, title: 'Backend Engineer', company_id: company!.id, description_text: `https://jobs.lever.co/${dead}/x` })
      .select('id')
      .single();
    expect(job).not.toBeNull();
    let calls = 0;
    const lever: SourceAdapter = {
      id: 'lever',
      search: async (p) => {
        if (p.board === dead) calls += 1;
        return [];
      },
    };
    const deps = { adapters: { lever }, createContext: () => ({}) as never };
    await discoverBoards(db, deps);
    const { data } = await db.from('source_boards').select('origin, enabled, failures').eq('source_id', 'lever').eq('slug', dead).single();
    expect(data).toEqual({ origin: 'discovered', enabled: false, failures: 3 });
    await discoverBoards(db, deps);
    expect(calls).toBe(1);
  });
});
