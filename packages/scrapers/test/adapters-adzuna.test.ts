import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { adzunaAdapter } from '../src/adapters/adzuna';
import { fakeContext } from './fake-context';

const fx = readFileSync(new URL('../fixtures/adzuna.json', import.meta.url), 'utf8');
const env = { ADZUNA_APP_ID: 'id1', ADZUNA_APP_KEY: 'key1' };

describe('adzuna', () => {
  it('is configured only with both keys', () => {
    expect(adzunaAdapter.isConfigured?.({ ADZUNA_APP_ID: 'x' })).toBe(false);
    expect(adzunaAdapter.isConfigured?.(env)).toBe(true);
  });
  it('queries the official API and maps jobs', async () => {
    const { ctx, calls } = fakeContext({ 'api.adzuna.com': fx }, env);
    const jobs = await adzunaAdapter.search({ what: 'react remote', country: 'pl' }, ctx);
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.adzuna.com/v1/api/jobs/pl/search/1');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ app_id: 'id1', app_key: 'key1', what: 'react remote', results_per_page: '50', max_days_old: '7', 'content-type': 'application/json' });
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ externalId: '4870001001', title: 'Senior React Developer (Remote)', company: 'Acme Software', url: 'https://www.adzuna.pl/land/ad/4870001001?se=x' });
    expect(jobs[0]!.salaryRaw).toBe('180000–240000 PLN / year');
    expect(jobs[1]!.salaryRaw ?? null).toBeNull();
    expect(jobs[2]!.companyIsPlaceholder).toBe(true);
    for (const j of jobs) expect(await normalizeJob(j), j.title).not.toBeNull();
  });
  it('rejects unknown countries and empty queries', async () => {
    const { ctx } = fakeContext({}, env);
    expect(await adzunaAdapter.search({ what: 'react', country: 'xx' }, ctx)).toEqual([]);
    expect(await adzunaAdapter.search({ country: 'pl' }, ctx)).toEqual([]);
  });
});
