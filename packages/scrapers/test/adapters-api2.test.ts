import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { workingnomadsAdapter } from '../src/adapters/workingnomads';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

async function allNormalize(jobs: Awaited<ReturnType<typeof workingnomadsAdapter.search>>) {
  expect(jobs.length).toBe(3);
  const normalized = await Promise.all(jobs.map(normalizeJob));
  expect(normalized.every(Boolean)).toBe(true);
  return normalized;
}

describe('workingnomadsAdapter', () => {
  it('uses the numeric id from the URL', async () => {
    const { ctx } = fakeContext({ 'workingnomads.com/api': fixture('workingnomads.json') });
    const jobs = await workingnomadsAdapter.search({}, ctx);
    expect(jobs.every((j) => /^\d+$/.test(j.externalId))).toBe(true);
    await allNormalize(jobs);
  });
});
