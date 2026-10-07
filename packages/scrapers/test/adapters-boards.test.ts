import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { ashbyAdapter } from '../src/adapters/ashby';
import { greenhouseAdapter } from '../src/adapters/greenhouse';
import { leverAdapter } from '../src/adapters/lever';
import { telegramAdapter } from '../src/adapters/telegram';
import { workableAdapter } from '../src/adapters/workable';
import { fakeContext } from './fake-context';

const fx = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

async function expectValid(jobs: Awaited<ReturnType<typeof greenhouseAdapter.search>>) {
  expect(jobs.length).toBeGreaterThan(0);
  for (const j of jobs) {
    expect(await normalizeJob(j), j.title).not.toBeNull();
    expect(j.url).toMatch(/^https:\/\//);
  }
}

describe('board adapters', () => {
  it('greenhouse keeps tech roles with board links and regions', async () => {
    const { ctx, calls } = fakeContext({ 'boards-api.greenhouse.io': fx('greenhouse.json') });
    const jobs = await greenhouseAdapter.search({ board: 'gitlab' }, ctx);
    expect(calls[0]!.url).toBe('https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true');
    expect(jobs.every((j) => /engineer|developer|front|full|software|web/i.test(j.title))).toBe(true);
    await expectValid(jobs);
  });
  it('lever', async () => {
    const { ctx, calls } = fakeContext({ 'api.lever.co': fx('lever.json') });
    const jobs = await leverAdapter.search({ board: 'spotify' }, ctx);
    expect(calls[0]!.url).toBe('https://api.lever.co/v0/postings/spotify?mode=json');
    await expectValid(jobs);
  });
  it('ashby', async () => {
    const { ctx, calls } = fakeContext({ 'api.ashbyhq.com': fx('ashby.json') });
    const jobs = await ashbyAdapter.search({ board: 'supabase' }, ctx);
    expect(calls[0]!.url).toBe('https://api.ashbyhq.com/posting-api/job-board/supabase');
    await expectValid(jobs);
  });
  it('workable', async () => {
    const { ctx } = fakeContext({ 'apply.workable.com': fx('workable.json') });
    await expectValid(await workableAdapter.search({ board: 'modash' }, ctx));
  });
  it('telegram turns channel posts into placeholder-company jobs', async () => {
    const { ctx, calls } = fakeContext({ 't.me/s/job_it_junior': fx('telegram.html') });
    const jobs = await telegramAdapter.search({ board: 'job_it_junior' }, ctx);
    expect(calls[0]!.url).toBe('https://t.me/s/job_it_junior');
    expect(jobs.length).toBeGreaterThan(3);
    for (const j of jobs) {
      expect(j.url).toMatch(/^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+$/);
      expect(j.companyIsPlaceholder).toBe(true);
      expect(j.description!.length).toBeGreaterThan(80);
    }
    await expectValid(jobs);
  });
  it('returns nothing without a board', async () => {
    const { ctx } = fakeContext({});
    expect(await greenhouseAdapter.search({}, ctx)).toEqual([]);
    expect(await telegramAdapter.search({}, ctx)).toEqual([]);
  });
});
