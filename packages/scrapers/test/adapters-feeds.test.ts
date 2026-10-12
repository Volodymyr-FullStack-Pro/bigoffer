import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { djinniAdapter } from '../src/adapters/djinni';
import { douAdapter, splitDouTitle } from '../src/adapters/dou';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

async function expectNormalizable(jobs: Awaited<ReturnType<typeof douAdapter.search>>) {
  expect(jobs.length).toBeGreaterThan(0);
  for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
}

describe('splitDouTitle', () => {
  it('splits role, company and locations', () => {
    expect(splitDouTitle('Front-end Developer (React + TypeScript) в "ІНФОТЕХ", Київ, віддалено')).toEqual({
      title: 'Front-end Developer (React + TypeScript)',
      company: 'ІНФОТЕХ',
      location: 'Київ, віддалено',
    });
    expect(splitDouTitle('QA в Acme')).toEqual({ title: 'QA', company: 'Acme', location: null });
  });
});

describe('douAdapter', () => {
  it('builds the feed URL and maps items', async () => {
    const { ctx, calls } = fakeContext({ 'jobs.dou.ua/vacancies/feeds': fixture('dou.xml') });
    const jobs = await douAdapter.search({ search: 'react developer' }, ctx);
    expect(calls[0]!.url).toBe('https://jobs.dou.ua/vacancies/feeds/?search=react%20developer');
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.externalId).toMatch(/^\d+$/);
    expect(jobs[0]!.url).not.toContain('utm_source');
    await expectNormalizable(jobs);
  });
});

describe('djinniAdapter', () => {
  it('reads JSON-LD from listing pages and stops when a page is empty', async () => {
    const { ctx, calls } = fakeContext({ 'jobs/rss/': '<rss><channel></channel></rss>', 'page=2': '<html></html>', 'djinni.co/jobs/': fixture('djinni.html') });
    const jobs = await djinniAdapter.search({ primary_keyword: 'JavaScript' }, ctx);
    expect(calls.map((c) => c.url)).toEqual([
      'https://djinni.co/jobs/?primary_keyword=JavaScript',
      'https://djinni.co/jobs/?primary_keyword=JavaScript&page=2',
      'https://djinni.co/jobs/rss/?primary_keyword=JavaScript',
    ]);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.company).not.toBe('');
    await expectNormalizable(jobs);
  });

  it('adds recent feed postings the pages missed, read from their own page', async () => {
    const recent = new Date(Date.now() - 3600_000).toUTCString();
    const old = new Date(Date.now() - 10 * 24 * 3600_000).toUTCString();
    const item = (id: string, title: string, date: string) =>
      `<item><title>${title}</title><link>https://djinni.co/jobs/${id}-x/</link><description>&lt;p&gt;React and Node.js&lt;/p&gt;</description><pubDate>${date}</pubDate><guid>https://djinni.co/jobs/${id}-x/</guid></item>`;
    const rss = `<rss><channel>${item('787644', 'Known', recent)}${item('900001', 'Fullstack Developer (React / Node.js)', recent)}${item('900002', 'Node.js Developer', recent)}${item('900003', 'Old one', old)}</channel></rss>`;
    const detail = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      identifier: 900001,
      url: 'https://djinni.co/jobs/900001-x/',
      title: 'Fullstack Developer (React / Node.js)',
      description: 'React and Node.js',
      datePosted: '2026-10-09T10:17:13',
      hiringOrganization: { name: 'Acme' },
    })}</script>`;
    const { ctx } = fakeContext({
      'jobs/rss/': rss,
      'jobs/900001-x/': detail,
      'jobs/900002-x/': '<html>blocked</html>',
      'page=2': '<html></html>',
      'djinni.co/jobs/': fixture('djinni.html'),
    });
    const jobs = await djinniAdapter.search({ primary_keyword: 'Fullstack' }, ctx);
    const extra = jobs.slice(3);
    expect(extra.map((j) => [j.externalId, j.company, j.companyIsPlaceholder])).toEqual([
      ['900001', 'Acme', false],
      ['900002', 'Djinni', true],
    ]);
    expect(jobs.filter((j) => j.externalId === '787644')).toHaveLength(1);
    await expectNormalizable(jobs);
  });
});
