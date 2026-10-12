import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { linkedinAdapter, linkedinUrl } from '../src/adapters/linkedin';
import { workuaAdapter, workuaUrl } from '../src/adapters/workua';
import type { AdapterContext } from '../src/types';
import { fakeContext } from './fake-context';

const CARD = '[data-cy="l-card"]';
const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

function browserContext(html: string) {
  const renderPage = vi.fn(async () => html);
  const ctx: AdapterContext = {
    env: {},
    fetchText: async () => { throw new Error('unexpected fetch'); },
    fetchJson: async () => { throw new Error('unexpected fetch'); },
    renderPage,
  };
  return { ctx, renderPage };
}

describe('URL builders', () => {
  it('builds Work.ua and LinkedIn search URLs', () => {
    expect(workuaUrl({ search: 'react developer', remote: '1' })).toBe('https://www.work.ua/jobs-remote-react+developer/');
    expect(workuaUrl({ search: 'react' })).toBe('https://www.work.ua/jobs-react/');
    expect(linkedinUrl({ keywords: 'react', location: 'Worldwide', remote: '1' })).toBe(
      'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react&location=Worldwide&f_WT=2&f_TPR=r604800&sortBy=DD&start=0',
    );
  });
});

describe('linkedinAdapter', () => {
  it('parses guest job cards and fills each with the posting description', async () => {
    const { ctx, calls } = fakeContext({
      'jobs/api/jobPosting/4435327942': '<html>rate limited</html>',
      'jobs/api/jobPosting/': fixture('linkedin-posting.html'),
      'linkedin.com/jobs-guest': fixture('linkedin.html'),
    });
    const jobs = await linkedinAdapter.search({ keywords: 'react', location: 'Ukraine' }, ctx);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.externalId).toMatch(/^\d+$/);
    expect(jobs[0]!.url).toMatch(/^https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^?]+$/);
    expect(jobs[0]!.description).toContain('3+ years with React and TypeScript');
    expect(jobs[0]!.description).toContain('Seniority level: Mid-Senior level');
    // a posting page without the markup (blocked, changed) keeps the card
    expect(jobs.find((j) => j.externalId === '4435327942')!.description).toBe('');
    // fewer than a full page of cards: no second search page
    expect(calls.filter((c) => c.url.includes('/search?'))).toHaveLength(1);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
  it('tells closed and removed postings apart from open ones', async () => {
    const url = 'https://ua.linkedin.com/jobs/view/react-developer-at-acme-4435334788';
    const open = fakeContext({ jobPosting: fixture('linkedin-posting.html') });
    expect(await linkedinAdapter.isOpen!(url, open.ctx)).toBe(true);
    expect(open.calls[0]!.url).toBe('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4435334788');
    const closed = fakeContext({ jobPosting: '<figure class="closed-job"><figcaption>No longer accepting applications</figcaption></figure>' });
    expect(await linkedinAdapter.isOpen!(url, closed.ctx)).toBe(false);
    const gone: AdapterContext = { env: {}, fetchJson: async () => ({}) as never, fetchText: async () => { throw new Error('HTTP 404 Not Found'); } };
    expect(await linkedinAdapter.isOpen!(url, gone)).toBe(false);
    const blocked: AdapterContext = { ...gone, fetchText: async () => { throw new Error('HTTP 429 Too Many Requests'); } };
    expect(await linkedinAdapter.isOpen!(url, blocked)).toBeNull();
    expect(await linkedinAdapter.isOpen!('https://www.linkedin.com/jobs/', open.ctx)).toBeNull();
  });
});

describe('workuaAdapter', () => {
  it('renders the page and parses cards', async () => {
    const { ctx, renderPage } = browserContext(fixture('workua.html'));
    const jobs = await workuaAdapter.search({ search: 'react', remote: '1' }, ctx);
    expect(renderPage).toHaveBeenCalledWith('https://www.work.ua/jobs-remote-react/', { waitForSelector: 'div.card.job-link' });
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.url).toMatch(/^https:\/\/www\.work\.ua\/jobs\/\d+\/$/);
    expect(jobs[0]!.company.length).toBeGreaterThan(0);
    expect(jobs[0]!.postedAt).toBe(new Date(Date.UTC(2026, 9, 2)).toISOString()); // "вакансія від 2 жовтня 2026"
    const paid = jobs.filter((j) => j.salaryRaw);
    expect(paid.length).toBeGreaterThan(0);
    for (const j of paid) expect(j.salaryPeriod).toBe('month');
    for (const j of jobs.filter((j) => !j.salaryRaw)) expect(j.salaryPeriod).toBeUndefined();
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });

  it('fails clearly without a renderer', async () => {
    const { ctx } = fakeContext({});
    await expect(workuaAdapter.search({ search: 'react' }, ctx)).rejects.toThrow(/browser/i);
  });
});
