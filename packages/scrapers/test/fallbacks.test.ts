import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { djinniAdapter } from '../src/adapters/djinni';
import { douAdapter } from '../src/adapters/dou';
import { himalayasAdapter } from '../src/adapters/himalayas';
import { hnAdapter } from '../src/adapters/hn';
import { joobleAdapter } from '../src/adapters/jooble';
import { robotauaAdapter } from '../src/adapters/robotaua';
import { fakeContext } from './fake-context';

const hnSearch = { hits: [{ objectID: '1', title: 'Ask HN: Who is hiring? (October 2026)' }] };
const hnItem = (texts: string[]) => ({
  children: texts.map((text, i) => ({ id: 100 + i, text, created_at: '2026-10-01T15:02:37.000Z' })),
});
const longSentence = `We are a small profitable team building ${'very interesting developer tooling for everyone '.repeat(5)}`;

describe('hnAdapter titles', () => {
  it('stops the header at the first <p> paragraph', async () => {
    const { ctx } = fakeContext({
      search_by_date: hnSearch,
      'api/v1/items/': hnItem([`Acme | Senior Backend Engineer | Remote (US)<p>${longSentence}<p>More text`]),
    });
    const [job] = await hnAdapter.search({}, ctx);
    expect(job).toMatchObject({ company: 'Acme', title: 'Senior Backend Engineer', location: 'Remote (US)' });
    expect(job!.companyIsPlaceholder).toBeFalsy();
  });

  it('falls back to "Multiple roles" when the header segment is a paragraph', async () => {
    const { ctx } = fakeContext({
      search_by_date: hnSearch,
      'api/v1/items/': hnItem([`Acme | ${longSentence} engineers | Remote`]),
    });
    const [job] = await hnAdapter.search({}, ctx);
    expect(job!.title).toBe('Multiple roles');
    expect(job!.title.length).toBeLessThanOrEqual(120);
  });

  it('prefers a short role segment over a long one', async () => {
    const { ctx } = fakeContext({
      search_by_date: hnSearch,
      'api/v1/items/': hnItem([`Acme | ${longSentence} engineers | Staff Engineer | Remote`]),
    });
    const [job] = await hnAdapter.search({}, ctx);
    expect(job!.title).toBe('Staff Engineer');
  });

  it('marks a header without a company as a placeholder', async () => {
    const { ctx } = fakeContext({
      search_by_date: hnSearch,
      'api/v1/items/': hnItem([`${longSentence}<p>details`]),
    });
    const [job] = await hnAdapter.search({}, ctx);
    expect(job!.company).toBe('Hacker News');
    expect(job!.companyIsPlaceholder).toBe(true);
    expect(job!.title.length).toBeLessThanOrEqual(120);
    expect(await normalizeJob(job!)).not.toBeNull();
  });
});

describe('placeholder companies', () => {
  it('djinni', async () => {
    const ld = (extra: object) =>
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'JobPosting',
        title: 'React Developer',
        url: 'https://djinni.co/jobs/1-react/',
        identifier: 1,
        ...extra,
      })}</script>`;
    const { ctx } = fakeContext({
      'page=2': '<html></html>',
      'djinni.co/jobs/': `${ld({})}${ld({ identifier: 2, hiringOrganization: { name: 'Acme' } })}`,
    });
    const jobs = await djinniAdapter.search({}, ctx);
    expect(jobs.map((j) => [j.company, Boolean(j.companyIsPlaceholder)])).toEqual([
      ['Djinni', true],
      ['Acme', false],
    ]);
  });

  it('dou', async () => {
    const rss = `<rss><channel>
      <item><title>QA Engineer</title><link>https://jobs.dou.ua/companies/x/vacancies/11/</link><description>d</description><pubDate>Thu, 01 Oct 2026 16:26:14 +0300</pubDate></item>
      <item><title>QA Engineer в Acme, Київ</title><link>https://jobs.dou.ua/companies/x/vacancies/12/</link><description>d</description><pubDate>Thu, 01 Oct 2026 16:26:14 +0300</pubDate></item>
    </channel></rss>`;
    const { ctx } = fakeContext({ 'jobs.dou.ua': rss });
    const jobs = await douAdapter.search({}, ctx);
    expect(jobs.map((j) => [j.company, Boolean(j.companyIsPlaceholder)])).toEqual([
      ['DOU', true],
      ['Acme', false],
    ]);
  });

  it('jooble', async () => {
    const { ctx } = fakeContext(
      {
        'jooble.org': {
          jobs: [
            { id: 1, title: 'Dev', link: 'https://jooble.org/1', source: 'example.org' },
            { id: 2, title: 'Dev', link: 'https://jooble.org/2' },
            { id: 3, title: 'Dev', link: 'https://jooble.org/3', company: 'Acme' },
          ],
        },
      },
      { JOOBLE_API_KEY: 'k' },
    );
    const jobs = await joobleAdapter.search({}, ctx);
    expect(jobs.map((j) => [j.company, Boolean(j.companyIsPlaceholder)])).toEqual([
      ['example.org', true],
      ['Jooble', true],
      ['Acme', false],
    ]);
  });

  it('robota.ua', async () => {
    const { ctx } = fakeContext({
      'api.rabota.ua': {
        documents: [
          { id: 1, name: 'Dev', notebookId: 5 },
          { id: 2, name: 'Dev', notebookId: 5, companyName: 'Acme' },
        ],
      },
    });
    const jobs = await robotauaAdapter.search({}, ctx);
    expect(jobs.map((j) => [j.company, Boolean(j.companyIsPlaceholder)])).toEqual([
      ['robota.ua', true],
      ['Acme', false],
    ]);
  });
});

describe('himalayasAdapter salary period', () => {
  const job = (salaryPeriod: string | null, i: number) => ({
    guid: `https://himalayas.app/companies/x/jobs/${i}`,
    title: 'Dev',
    companyName: 'Acme',
    minSalary: 50,
    maxSalary: 60,
    currency: 'USD',
    salaryPeriod,
  });
  it('keeps annual and monthly salaries, drops hourly/weekly/daily', async () => {
    const periods = ['annual', 'year', 'monthly', 'month', 'hourly', 'weekly', 'daily', null];
    const { ctx } = fakeContext({ 'himalayas.app': { jobs: periods.map(job) } });
    const jobs = await himalayasAdapter.search({ q: 'x' }, ctx);
    expect(jobs.map((j) => [j.salaryPeriod ?? null, j.salaryRaw === null ? null : 'raw'])).toEqual([
      ['year', 'raw'],
      ['year', 'raw'],
      ['month', 'raw'],
      ['month', 'raw'],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
    ]);
  });
});
