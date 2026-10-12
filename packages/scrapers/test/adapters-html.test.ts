import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { linkedinAdapter, linkedinUrl } from '../src/adapters/linkedin';
import type { AdapterContext } from '../src/types';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('URL builders', () => {
  it('builds LinkedIn search URLs', () => {
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

