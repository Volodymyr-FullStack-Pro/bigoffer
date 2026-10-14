import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { boardLink } from '@jp/core';
import { fetchPosting } from '../src/posting';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('boardLink', () => {
  it('recognises vacancy links of the three boards and drops the rest', () => {
    expect(boardLink('https://djinni.co/jobs/852225-full-stack-developer/?from=list')).toEqual({ sourceId: 'djinni', url: 'https://djinni.co/jobs/852225-full-stack-developer/', id: '852225' });
    expect(boardLink('https://jobs.dou.ua/companies/binary-studio/vacancies/376457/#apply')).toEqual({ sourceId: 'dou', url: 'https://jobs.dou.ua/companies/binary-studio/vacancies/376457/', id: '376457' });
    expect(boardLink('https://robota.ua/ua/company15216249/vacancy11096413')).toMatchObject({ sourceId: 'robotaua', id: '11096413' });
    expect(boardLink('https://example.com/jobs/1')).toBeNull();
    expect(boardLink('https://djinni.co/my/inbox/1/')).toBeNull();
  });
});

describe('fetchPosting', () => {
  it('reads an inactive Djinni vacancy from its page, company and salary included', async () => {
    const { ctx } = fakeContext({ 'djinni.co/jobs/852225': fixture('djinni-vacancy-inactive.html') });
    const p = await fetchPosting('https://djinni.co/jobs/852225-full-stack-developer/', ctx);
    expect(p).toMatchObject({ sourceId: 'djinni', job: { externalId: '852225', title: 'Full-Stack developer', company: 'Kontrora', url: 'https://djinni.co/jobs/852225-full-stack-developer/' } });
    const n = await normalizeJob(p!.job);
    expect(n?.descriptionText).toContain('Kontrora PSA');
    expect(n?.salaryMaxUsd).toBe(8000);
    // "Only from 3 years of experience" comes from the board's JSON-LD (monthsOfExperience: 36).
    expect(p!.job.tags).toContain('years:3');
  });

  it('reads a DOU vacancy page: title, company, place and the description', async () => {
    const { ctx } = fakeContext({ 'jobs.dou.ua': fixture('dou-vacancy-page.html') });
    const p = await fetchPosting('https://jobs.dou.ua/companies/binary-studio/vacancies/376457/', ctx);
    expect(p).toMatchObject({ sourceId: 'dou', job: { externalId: '376457', title: 'Middle JS Full-Stack Engineer', company: 'Binary Studio', location: 'за кордоном, віддалено' } });
    const n = await normalizeJob(p!.job);
    expect(n?.descriptionText).toContain('aviation');
    expect(n?.descriptionText).not.toContain('<');
    expect(n?.remoteType).toBe('remote');
  });

  it('reads a robota.ua vacancy from its API, with the contact person', async () => {
    const { ctx } = fakeContext({ 'api.rabota.ua/vacancy?id=11096413': { id: 11096413, name: 'Intern front-end developer', companyName: 'King Group', cityName: 'Київ', salary: 22000, notebookId: 15216249, description: '<p>React</p>', contactPerson: 'Артур' } });
    const p = await fetchPosting('https://robota.ua/company15216249/vacancy11096413', ctx);
    expect(p).toMatchObject({ sourceId: 'robotaua', recruiter: 'Артур', job: { company: 'King Group', salaryRaw: '22000 грн', url: 'https://robota.ua/company15216249/vacancy11096413' } });
  });

  it('ignores links of other sites', async () => {
    const { ctx, calls } = fakeContext({});
    expect(await fetchPosting('https://example.com/job', ctx)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('djinni listing English levels', () => {
  it('reads the level each job card shows', async () => {
    const { englishByJob } = await import('../src/adapters/djinni');
    const levels = englishByJob(fixture('djinni-list-english.html'));
    expect(levels.size).toBeGreaterThan(5);
    expect([...levels.values()].every((l) => /^[ABC][12]$/.test(l))).toBe(true);
  });
});
