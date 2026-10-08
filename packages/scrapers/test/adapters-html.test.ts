import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { linkedinAdapter, linkedinUrl } from '../src/adapters/linkedin';
import { olxAdapter, olxUrl } from '../src/adapters/olx';
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
  it('builds Work.ua, OLX and LinkedIn search URLs', () => {
    expect(workuaUrl({ search: 'react developer', remote: '1' })).toBe('https://www.work.ua/jobs-remote-react+developer/');
    expect(workuaUrl({ search: 'react' })).toBe('https://www.work.ua/jobs-react/');
    expect(olxUrl({ search: 'full stack' })).toBe('https://www.olx.ua/uk/rabota/q-full-stack/');
    expect(linkedinUrl({ keywords: 'react', location: 'Worldwide', remote: '1' })).toBe(
      'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react&location=Worldwide&f_WT=2&start=0',
    );
  });
});

describe('linkedinAdapter', () => {
  it('parses guest job cards', async () => {
    const { ctx } = fakeContext({ 'linkedin.com/jobs-guest': fixture('linkedin.html') });
    const jobs = await linkedinAdapter.search({ keywords: 'react', location: 'Ukraine' }, ctx);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.externalId).toMatch(/^\d+$/);
    expect(jobs[0]!.url).toMatch(/^https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^?]+$/);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
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

describe('olxAdapter', () => {
  it('renders the page and parses cards', async () => {
    const { ctx, renderPage } = browserContext(fixture('olx.html'));
    const jobs = await olxAdapter.search({ search: 'react' }, ctx);
    expect(renderPage).toHaveBeenCalledWith('https://www.olx.ua/uk/rabota/q-react/', { waitForSelector: '[data-cy="l-card"]' });
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.url).toMatch(/^https:\/\/www\.olx\.ua\/uk\/obyavlenie\//);
    for (const raw of jobs) expect(`${raw.title} ${raw.description}`).not.toMatch(/[{}]|var\(--/);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });

  it('skips goods/services cards that OLX spills into job searches', async () => {
    const $ = load(fixture('olx.html'));
    const goods = $(CARD).first().clone();
    goods.attr('id', '999000111');
    goods
      .find('[data-testid="card-title-link"]')
      .attr('href', '/d/uk/obyavlenie/krosvki-nike-react-element-55-ID11mavD.html?search_reason=search%7Corganic');
    $(CARD).last().after(goods);
    expect($(CARD)).toHaveLength(4);
    const { ctx } = browserContext($.html());
    const jobs = await olxAdapter.search({ search: 'react' }, ctx);
    expect(jobs).toHaveLength(3);
    for (const raw of jobs) expect(raw.url).toContain('/obyavlenie/rabota/');
    expect(jobs.map((j) => j.externalId)).not.toContain('999000111');
  });
});
