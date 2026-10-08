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
  it('lever and ashby use the board display name as company when given', async () => {
    const lever = fakeContext({ 'api.lever.co': fx('lever.json') });
    const leverJobs = await leverAdapter.search({ board: 'ajax', name: 'Ajax Systems' }, lever.ctx);
    expect(leverJobs.length).toBeGreaterThan(0);
    expect(leverJobs.every((j) => j.company === 'Ajax Systems')).toBe(true);
    const ashby = fakeContext({ 'api.ashbyhq.com': fx('ashby.json') });
    const ashbyJobs = await ashbyAdapter.search({ board: 'preply', name: 'Preply' }, ashby.ctx);
    expect(ashbyJobs.every((j) => j.company === 'Preply')).toBe(true);
    const fallback = await leverAdapter.search({ board: 'ajax' }, fakeContext({ 'api.lever.co': fx('lever.json') }).ctx);
    expect(fallback.every((j) => j.company === 'ajax')).toBe(true);
  });
  it('lever throws on a non-list response so the board counts as failed', async () => {
    const { ctx } = fakeContext({ 'api.lever.co': { ok: false, error: 'Document not found' } });
    await expect(leverAdapter.search({ board: 'gone' }, ctx)).rejects.toThrow(/Lever/);
  });
  it('telegram throws on a page without any messages but keeps [] when all posts are filtered', async () => {
    const dead = fakeContext({ 't.me/s/renamed_chan': '<html><head><meta property="og:title" content="Telegram"></head><body></body></html>' });
    await expect(telegramAdapter.search({ board: 'renamed_chan' }, dead.ctx)).rejects.toThrow(/no public posts/);
    const filtered = fakeContext({
      't.me/s/quiet_chan': '<div class="tgme_widget_message" data-post="quiet_chan/1"><div class="tgme_widget_message_text">hi</div></div>',
    });
    expect(await telegramAdapter.search({ board: 'quiet_chan' }, filtered.ctx)).toEqual([]);
  });
  it('telegram ignores posts whose data-post names another channel', async () => {
    const text = 'We are hiring a Senior Developer for our team, remote, great salary and benefits, apply now via the link below please.';
    const html = ['evil_chan/5', 'my_chan/6', 'MY_CHAN/7', 'my chan/8']
      .map((p) => `<div class="tgme_widget_message" data-post="${p}"><div class="tgme_widget_message_text">${text}</div></div>`)
      .join('');
    const { ctx } = fakeContext({ 't.me/s/my_chan': html });
    const jobs = await telegramAdapter.search({ board: 'my_chan' }, ctx);
    expect(jobs.map((j) => j.externalId)).toEqual(['my_chan/6', 'MY_CHAN/7']);
  });
  it('returns nothing without a board', async () => {
    const { ctx } = fakeContext({});
    expect(await greenhouseAdapter.search({}, ctx)).toEqual([]);
    expect(await telegramAdapter.search({}, ctx)).toEqual([]);
  });
});
