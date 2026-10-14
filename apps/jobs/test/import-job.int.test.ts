import type { AdapterContext } from '@jp/scrapers';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { importJob } from '../src/pipeline/import-job';

const db = getDb();
const uniq = `${Date.now()}`.slice(-7);
const ids: string[] = [];

afterAll(async () => {
  if (ids.length) await db.from('jobs').delete().in('id', ids);
});

const ctx = (body: object): AdapterContext => ({
  env: {},
  fetchText: async () => JSON.stringify(body),
  fetchJson: async <T>() => body as T,
});

describe('importJob', () => {
  it('stores a pasted robota.ua vacancy as a job and returns the card fields', async () => {
    const vacancy = { id: Number(uniq), name: `Import Dev ${uniq}`, companyName: `Import Co ${uniq}`, cityName: 'Київ', salary: 50000, notebookId: 42, description: '<p>React and Node.js</p>', contactPerson: 'Olena' };
    const job = await importJob(db, ctx(vacancy), `https://robota.ua/company42/vacancy${uniq}`, new Date());
    expect(job).toMatchObject({ sourceId: 'robotaua', title: `Import Dev ${uniq}`, company: `Import Co ${uniq}`, salary: '50000 грн', recruiter: 'Olena' });
    ids.push(job!.jobId);
    const { data } = await db.from('jobs').select('title, description_text').eq('id', job!.jobId).single();
    expect(data?.description_text).toContain('React and Node.js');
    // Pasting the same link again reuses the stored job.
    expect((await importJob(db, ctx(vacancy), `https://robota.ua/company42/vacancy${uniq}`, new Date()))?.jobId).toBe(job!.jobId);
  });

  it('ignores links of other sites', async () => {
    expect(await importJob(db, ctx({}), 'https://example.com/job/1', new Date())).toBeNull();
  });
});
