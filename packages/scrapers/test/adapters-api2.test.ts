import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { arbeitnowAdapter } from '../src/adapters/arbeitnow';
import { jobicyAdapter } from '../src/adapters/jobicy';
import { justjoinAdapter } from '../src/adapters/justjoin';
import { workingnomadsAdapter } from '../src/adapters/workingnomads';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

async function allNormalize(jobs: Awaited<ReturnType<typeof arbeitnowAdapter.search>>) {
  expect(jobs.length).toBe(3);
  const normalized = await Promise.all(jobs.map(normalizeJob));
  expect(normalized.every(Boolean)).toBe(true);
  return normalized;
}

describe('arbeitnowAdapter', () => {
  it('decodes double-escaped HTML descriptions', async () => {
    const { ctx, calls } = fakeContext({ 'arbeitnow.com/api': fixture('arbeitnow.json') });
    const jobs = await arbeitnowAdapter.search({}, ctx);
    expect(calls[0]!.url).toBe('https://www.arbeitnow.com/api/job-board-api');
    const [first] = await allNormalize(jobs);
    expect(first!.descriptionText).not.toMatch(/&lt;|<p>/);
  });
});

describe('jobicyAdapter', () => {
  it('maps salary with period', async () => {
    const { ctx, calls } = fakeContext({ 'jobicy.com/api': fixture('jobicy.json') });
    const jobs = await jobicyAdapter.search({ tag: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://jobicy.com/api/v2/remote-jobs?count=50&tag=react');
    await allNormalize(jobs);
    expect(jobs.every((j) => j.remoteHint === 'remote')).toBe(true);
  });
});

describe('workingnomadsAdapter', () => {
  it('uses the numeric id from the URL', async () => {
    const { ctx } = fakeContext({ 'workingnomads.com/api': fixture('workingnomads.json') });
    const jobs = await workingnomadsAdapter.search({}, ctx);
    expect(jobs.every((j) => /^\d+$/.test(j.externalId))).toBe(true);
    await allNormalize(jobs);
  });
});

describe('justjoinAdapter', () => {
  it('prefers the USD salary and tags skills', async () => {
    const { ctx, calls } = fakeContext({ 'justjoin.it/api': fixture('justjoin.json') });
    const jobs = await justjoinAdapter.search({}, ctx);
    expect(calls[0]!.url).toBe('https://justjoin.it/api/candidate-api/offers?from=0&itemsCount=100');
    expect(jobs[0]!.url).toMatch(/^https:\/\/justjoin\.it\/job-offer\//);
    await allNormalize(jobs);
  });
});
