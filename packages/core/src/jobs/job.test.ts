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

  it('treats remoteHint unknown as no hint', async () => {
    const job = await normalizeJob({ ...base, remoteHint: 'unknown' });
    expect(job!.remoteType).toBe('remote');
  });

  it('parses numeric string postedAt and rejects non-positive', async () => {
    expect((await normalizeJob({ ...base, postedAt: '1790950918' }))!.postedAt?.getUTCFullYear()).toBe(2026);
    expect((await normalizeJob({ ...base, postedAt: '1790950918000' }))!.postedAt?.getUTCFullYear()).toBe(2026);
    expect((await normalizeJob({ ...base, postedAt: 0 }))!.postedAt).toBeNull();
    expect((await normalizeJob({ ...base, postedAt: '-5' }))!.postedAt).toBeNull();
  });

  it('caps a paragraph-long title at a word boundary', async () => {
    const title = `Senior Engineer ${'lorem ipsum dolor sit amet '.repeat(63)}`.slice(0, 1700);
    const job = await normalizeJob({ ...base, title });
    expect(job).not.toBeNull();
    expect(job!.title.length).toBeLessThanOrEqual(141);
    expect(job!.title.endsWith('…')).toBe(true);
    expect(job!.title).toMatch(/^Senior Engineer lorem/);
    expect(job!.title.slice(0, -1)).not.toMatch(/\s$/);
    expect(title.startsWith(job!.title.slice(0, -1))).toBe(true);
    expect(title[job!.title.length - 1]).toBe(' ');
  });

  it('keeps titles up to 200 characters intact', async () => {
    const title = 'A'.repeat(10) + ' b'.repeat(95);
    expect((await normalizeJob({ ...base, title }))!.title).toBe(title);
  });

  it('exposes the canonical title used for dedupe', async () => {
    const job = await normalizeJob({ ...base, title: 'Senior C++ Developer' });
    expect(job!.canonicalTitle).toBe('senior cplusplus developer');
  });

  it('gives placeholder-company jobs a per-posting fingerprint', async () => {
    const anon = { ...base, company: 'Djinni', companyIsPlaceholder: true };
    const a = await normalizeJob({ ...anon, externalId: '1' });
    const b = await normalizeJob({ ...anon, externalId: '2' });
    expect(a!.companyIsPlaceholder).toBe(true);
    expect(a!.fingerprint).not.toBe(b!.fingerprint);
    const real1 = await normalizeJob({ ...base, externalId: '1' });
    const real2 = await normalizeJob({ ...base, externalId: '2' });
    expect(real1!.companyIsPlaceholder).toBe(false);
    expect(real1!.fingerprint).toBe(real2!.fingerprint);
  });
});
