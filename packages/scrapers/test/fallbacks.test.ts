import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { djinniAdapter } from '../src/adapters/djinni';
import { douAdapter } from '../src/adapters/dou';
import { robotauaAdapter } from '../src/adapters/robotaua';
import { fakeContext } from './fake-context';

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

