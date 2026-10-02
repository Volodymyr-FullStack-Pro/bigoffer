import { describe, expect, it } from 'vitest';
import { normalizeJob } from './job';

const base = {
  externalId: '302434',
  url: 'https://jobs.dou.ua/companies/x/vacancies/302434/',
  title: 'Senior Front-end Developer (React &amp; TS)',
  company: '"ІНФОТЕХ"',
  description: '<p>Віддалено. React, TypeScript</p>',
  location: 'Київ',
  salaryRaw: '$3000-4000',
  postedAt: 'Thu, 01 Oct 2026 16:26:14 +0300',
};

describe('normalizeJob', () => {
  it('normalizes a valid raw job', async () => {
    const job = await normalizeJob(base);
    expect(job).not.toBeNull();
    expect(job!.title).toBe('Senior Front-end Developer (React & TS)');
    expect(job!.company).toBe('"ІНФОТЕХ"');
    expect(job!.companyNormalized).toBe('інфотех');
    expect(job!.descriptionText).toBe('Віддалено. React, TypeScript');
    expect(job!.remoteType).toBe('remote');
    expect(job!.seniority).toBe('senior');
    expect(job!.salaryMinUsd).toBe(3000);
    expect(job!.salaryMaxUsd).toBe(4000);
    expect(job!.postedAt?.toISOString()).toBe('2026-10-01T13:26:14.000Z');
    expect(job!.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('prefers remoteHint over detection', async () => {
    const job = await normalizeJob({ ...base, description: 'office', remoteHint: 'remote' });
    expect(job!.remoteType).toBe('remote');
  });

  it('accepts epoch seconds for postedAt', async () => {
    const job = await normalizeJob({ ...base, postedAt: 1790950918 });
    expect(job!.postedAt?.getUTCFullYear()).toBe(2026);
  });

  it('returns null for invalid input', async () => {
    expect(await normalizeJob({ ...base, url: 'not a url' })).toBeNull();
    expect(await normalizeJob({ ...base, title: '   ' })).toBeNull();
  });
});
