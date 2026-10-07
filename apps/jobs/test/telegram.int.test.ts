import type { BotApi, BotResult } from '@jp/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { localTime, sendAlerts, sendDigests } from '../src/pipeline/telegram';

const db = getDb();
const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createdUsers: string[] = [];
let companyId: string;
let chatSeq = 7_000_000_000 + (Date.now() % 1_000_000) * 100;

class FakeBot implements BotApi {
  sent: { chatId: number; text: string }[] = [];
  constructor(private result: BotResult = { ok: true }) {}
  async sendMessage(chatId: number, text: string): Promise<BotResult> {
    this.sent.push({ chatId, text });
    return this.result;
  }
  async answerCallback(): Promise<BotResult> {
    return { ok: true };
  }
  async clearButtons(): Promise<BotResult> {
    return { ok: true };
  }
}

async function makeUser(tag: string, profile: Record<string, unknown> = {}) {
  const { data, error } = await db.auth.admin.createUser({ email: `tg-${tag}-${uniq}@e2e.test`, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  createdUsers.push(id);
  const chatId = chatSeq++;
  const { error: upError } = await db.from('profiles').update({ telegram_chat_id: chatId, locale: 'en', ...profile }).eq('id', id);
  if (upError) throw upError;
  return { id, chatId };
}

let jobSeq = 0;
async function addMatch(userId: string, score: number, over: { isJob?: boolean | null; createdAt?: string; state?: string } = {}) {
  const n = jobSeq++;
  const { data: job, error } = await db
    .from('jobs')
    .insert({
      fingerprint: `tg-${n}-${uniq}`,
      title: `Dev ${n}`,
      company_id: companyId,
      remote_type: 'remote',
      is_job: over.isJob === undefined ? true : over.isJob,
    })
    .select('id')
    .single();
  if (error) throw error;
  const { data: match, error: matchError } = await db
    .from('job_matches')
    .insert({
      user_id: userId,
      job_id: job.id,
      score,
      state: over.state ?? 'new',
      explanation: { en: `why ${n}` },
      ...(over.createdAt ? { created_at: over.createdAt } : {}),
    })
    .select('id')
    .single();
  if (matchError) throw matchError;
  return match.id;
}

async function notified(ids: string[]) {
  const { data } = await db.from('job_matches').select('id, notified_at').in('id', ids);
  return new Map((data ?? []).map((r) => [r.id, r.notified_at !== null]));
}

beforeAll(async () => {
  const { data, error } = await db
    .from('companies')
    .insert({ name: `TG ${uniq}`, normalized_name: `tg ${uniq}` })
    .select('id')
    .single();
  if (error) throw error;
  companyId = data.id;
});

afterAll(async () => {
  await db.from('jobs').delete().like('fingerprint', `tg-%${uniq}`);
  await db.from('companies').delete().eq('id', companyId);
  for (const id of createdUsers) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

const run = (fn: typeof sendAlerts, bot: BotApi, userId: string, now = new Date()) =>
  fn(db, { bot, siteUrl: 'https://example.test', now, onlyUserIds: [userId] });

describe('sendAlerts', () => {
  it('alerts matches at or above the threshold once, in score order', async () => {
    const u = await makeUser('basic', { telegram_min_score: 75 });
    const [a, b, c] = [await addMatch(u.id, 90), await addMatch(u.id, 80), await addMatch(u.id, 60)] as [string, string, string];
    const bot = new FakeBot();
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 2, blocked: 0 });
    expect(bot.sent).toHaveLength(2);
    expect(bot.sent[0]!.chatId).toBe(u.chatId);
    expect(bot.sent[0]!.text).toContain('90%');
    expect(bot.sent[0]!.text).toContain('why');
    expect(bot.sent[1]!.text).toContain('80%');
    expect(await notified([a, b, c])).toEqual(new Map([[a, true], [b, true], [c, false]]));
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 0, sent: 0, blocked: 0 });
    expect(bot.sent).toHaveLength(2);
  });

  it('sends 5 alerts and one overflow line, marking all matches', async () => {
    const u = await makeUser('overflow');
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await addMatch(u.id, 95 - i));
    const bot = new FakeBot();
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 6, blocked: 0 });
    expect(bot.sent).toHaveLength(6);
    expect(bot.sent[5]!.text).toContain('2 more new jobs');
    expect([...(await notified(ids)).values()].every(Boolean)).toBe(true);
  });

  it('skips users with alerts off, non-jobs, old and non-new matches', async () => {
    const off = await makeUser('off', { telegram_alerts: false });
    await addMatch(off.id, 99);
    const bot = new FakeBot();
    expect(await run(sendAlerts, bot, off.id)).toEqual({ users: 0, sent: 0, blocked: 0 });

    const u = await makeUser('filters');
    const notJob = await addMatch(u.id, 99, { isJob: false });
    const unknown = await addMatch(u.id, 98, { isJob: null });
    await addMatch(u.id, 97, { createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
    await addMatch(u.id, 96, { state: 'hidden' });
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 1, blocked: 0 });
    expect(bot.sent).toHaveLength(1);
    expect((await notified([notJob, unknown])).get(notJob)).toBe(false);
    expect((await notified([notJob, unknown])).get(unknown)).toBe(true);
  });

  it('unlinks the chat when the bot is blocked and leaves the match unmarked', async () => {
    const u = await makeUser('blocked');
    const m = await addMatch(u.id, 90);
    const bot = new FakeBot({ ok: false, blocked: true, status: 403 });
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 0, blocked: 1 });
    const { data } = await db.from('profiles').select('telegram_chat_id').eq('id', u.id).single();
    expect(data!.telegram_chat_id).toBeNull();
    expect((await notified([m])).get(m)).toBe(false);
  });
});

describe('sendDigests', () => {
  // 2026-10-08 05:10 UTC = 08:10 in Europe/Kyiv (UTC+3).
  const at = new Date('2026-10-08T05:10:00Z');
  const hoursAgo = (h: number) => new Date(at.getTime() - h * 3600_000).toISOString();

  it('computes local hour and date', () => {
    expect(localTime(at, 'Europe/Kyiv')).toEqual({ hour: 8, date: '2026-10-08' });
    expect(localTime(new Date('2026-10-08T22:30:00Z'), 'Europe/Kyiv')).toEqual({ hour: 1, date: '2026-10-09' });
    expect(localTime(at, 'Not/AZone')).toBeNull();
  });

  it('sends one digest at the local hour, with top 10, the total and follow-ups', async () => {
    const u = await makeUser('digest', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    for (let i = 0; i < 12; i++) await addMatch(u.id, 50 + i, { createdAt: hoursAgo(1) });
    const { data: col } = await db.from('board_columns').select('id').eq('user_id', u.id).limit(1).single();
    await db.from('applications').insert([
      { user_id: u.id, column_id: col!.id, rank: 'a', title: 'Due role', company: 'DueCo', next_action_at: hoursAgo(1) },
      { user_id: u.id, column_id: col!.id, rank: 'b', title: 'Later role', company: 'LaterCo', next_action_at: new Date(at.getTime() + 86_400_000).toISOString() },
    ]);
    const bot = new FakeBot();
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 1, sent: 1, blocked: 0 });
    const text = bot.sent[0]!.text;
    expect(text).toContain('12 new jobs');
    expect(text.split('\n').filter((l) => l.startsWith('• ') && l.includes('%'))).toHaveLength(10);
    expect(text).toContain('DueCo');
    expect(text).not.toContain('LaterCo');
    const { data } = await db.from('profiles').select('digest_last_sent_on').eq('id', u.id).single();
    expect(data!.digest_last_sent_on).toBe('2026-10-08');

    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 0, sent: 0, blocked: 0 });
    expect(bot.sent).toHaveLength(1);
  });

  it('does nothing outside the digest hour', async () => {
    const u = await makeUser('wronghour', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    await addMatch(u.id, 80, { createdAt: new Date(at.getTime() + 3600_000 - 7200_000).toISOString() });
    const bot = new FakeBot();
    const later = new Date('2026-10-08T06:10:00Z'); // 09:10 Kyiv
    expect(await run(sendDigests, bot, u.id, later)).toEqual({ users: 0, sent: 0, blocked: 0 });
    expect(bot.sent).toHaveLength(0);
  });

  it('sends nothing when there is nothing to report, and does not recheck that day', async () => {
    const u = await makeUser('empty', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    const bot = new FakeBot();
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 1, sent: 0, blocked: 0 });
    expect(bot.sent).toHaveLength(0);
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 0, sent: 0, blocked: 0 });
  });

  it('unlinks the chat when the digest is blocked', async () => {
    const u = await makeUser('digestblocked', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    await addMatch(u.id, 80, { createdAt: hoursAgo(1) });
    const bot = new FakeBot({ ok: false, blocked: true, status: 403 });
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 1, sent: 0, blocked: 1 });
    const { data } = await db.from('profiles').select('telegram_chat_id').eq('id', u.id).single();
    expect(data!.telegram_chat_id).toBeNull();
  });
});
