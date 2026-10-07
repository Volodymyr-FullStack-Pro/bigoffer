import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { djinniAdapter } from '../src/adapters/djinni';
import { douAdapter, splitDouTitle } from '../src/adapters/dou';
import { wwrAdapter } from '../src/adapters/wwr';
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
    const { ctx, calls } = fakeContext({ 'page=2': '<html></html>', 'djinni.co/jobs/': fixture('djinni.html') });
    const jobs = await djinniAdapter.search({ primary_keyword: 'JavaScript' }, ctx);
    expect(calls.map((c) => c.url)).toEqual([
      'https://djinni.co/jobs/?primary_keyword=JavaScript',
      'https://djinni.co/jobs/?primary_keyword=JavaScript&page=2',
    ]);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.company).not.toBe('');
    await expectNormalizable(jobs);
  });
});

describe('wwrAdapter', () => {
  it('splits "Company: Role" titles and marks jobs remote', async () => {
    const { ctx } = fakeContext({ 'weworkremotely.com': fixture('wwr.xml') });
    const jobs = await wwrAdapter.search({}, ctx);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.company.length > 0 && !j.title.startsWith(`${j.company}:`))).toBe(true);
    expect(jobs.every((j) => j.remoteHint === 'remote')).toBe(true);
    await expectNormalizable(jobs);
  });
});
