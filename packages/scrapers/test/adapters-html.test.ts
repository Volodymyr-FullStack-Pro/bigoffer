import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it, vi } from 'vitest';
import { linkedinAdapter, linkedinUrl } from '../src/adapters/linkedin';
import { olxAdapter, olxUrl } from '../src/adapters/olx';
import { workuaAdapter, workuaUrl } from '../src/adapters/workua';
import type { AdapterContext } from '../src/types';
import { fakeContext } from './fake-context';

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
});
