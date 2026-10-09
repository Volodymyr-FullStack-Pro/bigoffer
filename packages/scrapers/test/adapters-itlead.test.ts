import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { itleadAdapter, ownVacancyIds } from '../src/adapters/itlead';
import { SourceBlockedError } from '../src/types';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const listing = fixture('itlead-listing.html');

describe('itlead', () => {
  it('reads only ITLead-origin cards from the RSC payload, even across chunks', () => {
    expect(ownVacancyIds(listing)).toEqual(['26676', '26690', '26700', '26701']);
    expect(ownVacancyIds('<html></html>')).toEqual([]);
  });

  it('maps own tech vacancies and skips re-posts, non-tech titles and failed pages', async () => {
    const { ctx, calls } = fakeContext({
      'vacancies?source=itlead': listing,
      'vacancies/26676': fixture('itlead-26676.html'),
      'vacancies/26690': fixture('itlead-26690.html'),
      'vacancies/26700': fixture('itlead-26700.html'),
    });
    const jobs = await itleadAdapter.search({}, ctx);

    expect(calls.map((c) => c.url)).toEqual([
      'https://itlead.org/vacancies?source=itlead',
      'https://itlead.org/vacancies/26676',
      'https://itlead.org/vacancies/26690',
      'https://itlead.org/vacancies/26700',
      'https://itlead.org/vacancies/26701',
    ]);
    expect(jobs.map((j) => j.externalId)).toEqual(['26676', '26690']);

    const [agency, named] = jobs;
    expect(agency).toMatchObject({
      url: 'https://itlead.org/vacancies/26676',
      title: 'Strong Junior / Middle Fullstack Developer (React / Node.js)',
      company: 'ITLead',
      companyIsPlaceholder: true,
      location: 'Ukraine',
      remoteHint: 'remote',
      remoteRegions: ['UA'],
      postedAt: '2026-10-08',
      salaryRaw: '$3,000 - $4,000/month',
    });
    expect(agency!.description).toContain('biometric identification platform');
    expect(agency!.description).toContain('\n\nStrong Junior or Middle level');
    expect(agency!.description).not.toContain('<b>');

    expect(named).toMatchObject({ company: 'Acme Biometrics', companyIsPlaceholder: false, salaryRaw: null, location: 'Ukraine' });
    expect(named!.remoteHint).toBeUndefined();
    expect(named!.remoteRegions).toBeUndefined();

    for (const j of jobs) expect(await normalizeJob(j), j.title).not.toBeNull();
  });

  it('rethrows a block instead of skipping the page', async () => {
    const { ctx } = fakeContext({ 'vacancies?source=itlead': listing });
    const blocked = {
      ...ctx,
      fetchText: async (url: string) => {
        if (url.includes('vacancies/')) throw new SourceBlockedError(429, url);
        return ctx.fetchText(url);
      },
    };
    await expect(itleadAdapter.search({}, blocked)).rejects.toBeInstanceOf(SourceBlockedError);
  });
});
