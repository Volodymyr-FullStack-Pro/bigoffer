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
  constructor(
    private result: BotResult = { ok: true },
    private failChat?: number,
    private failText?: string,
  ) {}
  async sendMessage(chatId: number, text: string): Promise<BotResult> {
    this.sent.push({ chatId, text });
    if (this.failChat !== undefined && chatId !== this.failChat) return { ok: true };
    if (this.failText !== undefined && !text.includes(this.failText)) return { ok: true };
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
type MatchOptions = {
  isJob?: boolean | null;
  createdAt?: string;
  state?: string;
  /** Job freshness; defaults to the match's created_at (or now). */
  firstSeenAt?: string;
  postedAt?: string | null;
  status?: 'active' | 'expired';
  /** Enriched jobs alert at once; defaults to true. */
  enriched?: boolean;
};

async function addMatch(userId: string, score: number, over: MatchOptions = {}) {
  const n = jobSeq++;
  const firstSeen = over.firstSeenAt ?? over.createdAt ?? new Date().toISOString();
  const { data: job, error } = await db
    .from('jobs')
    .insert({
      fingerprint: `tg-${n}-${uniq}`,
      title: `Dev ${n}`,
      company_id: companyId,
      remote_type: 'remote',
      is_job: over.isJob === undefined ? true : over.isJob,
      first_seen_at: firstSeen,
      posted_at: over.postedAt ?? null,
      status: over.status ?? 'active',
      enriched_at: over.enriched === false ? null : firstSeen,
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
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 2, blocked: 0, failed: 0 });
    expect(bot.sent).toHaveLength(2);
    expect(bot.sent[0]!.chatId).toBe(u.chatId);
    expect(bot.sent[0]!.text).toContain('90%');
    expect(bot.sent[0]!.text).toContain('why');
    expect(bot.sent[1]!.text).toContain('80%');
    expect(await notified([a, b, c])).toEqual(new Map([[a, true], [b, true], [c, false]]));
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 0, sent: 0, blocked: 0, failed: 0 });
    expect(bot.sent).toHaveLength(2);
  });

  it('sends 5 alerts and one overflow line, marking all matches', async () => {
    const u = await makeUser('overflow');
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await addMatch(u.id, 95 - i));
    const bot = new FakeBot();
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 6, blocked: 0, failed: 0 });
    expect(bot.sent).toHaveLength(6);
    expect(bot.sent[5]!.text).toContain('2 more new jobs');
    expect([...(await notified(ids)).values()].every(Boolean)).toBe(true);
  });

  it('skips users with alerts off, non-jobs, old and non-new matches', async () => {
    const off = await makeUser('off', { telegram_alerts: false });
    await addMatch(off.id, 99);
    const bot = new FakeBot();
    expect(await run(sendAlerts, bot, off.id)).toEqual({ users: 0, sent: 0, blocked: 0, failed: 0 });

    const u = await makeUser('filters');
    const notJob = await addMatch(u.id, 99, { isJob: false });
    const unknown = await addMatch(u.id, 98, { isJob: null });
    await addMatch(u.id, 97, { createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
    await addMatch(u.id, 96, { state: 'hidden' });
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 1, blocked: 0, failed: 0 });
    expect(bot.sent).toHaveLength(1);
    expect((await notified([notJob, unknown])).get(notJob)).toBe(false);
    expect((await notified([notJob, unknown])).get(unknown)).toBe(true);
  });

  it('skips matches for stale or expired jobs, even when the match row is new', async () => {
    const u = await makeUser('stale');
    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    const oldSeen = await addMatch(u.id, 99, { firstSeenAt: daysAgo(3) });
    const oldPosted = await addMatch(u.id, 98, { postedAt: daysAgo(3) });
    const expired = await addMatch(u.id, 97, { status: 'expired' });
    const freshPost = await addMatch(u.id, 96, { firstSeenAt: daysAgo(3), postedAt: new Date(Date.now() - 3600_000).toISOString() });
    const bot = new FakeBot();
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 1, blocked: 0, failed: 0 });
    expect(bot.sent[0]!.text).toContain('96%');
    expect(await notified([oldSeen, oldPosted, expired, freshPost])).toEqual(
      new Map([[oldSeen, false], [oldPosted, false], [expired, false], [freshPost, true]]),
    );
  });

  it('waits up to 45 minutes for enrichment before alerting', async () => {
    const u = await makeUser('enrich');
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    const waiting = await addMatch(u.id, 90, { enriched: false, createdAt: minutesAgo(5) });
    const overdue = await addMatch(u.id, 85, { enriched: false, createdAt: minutesAgo(50) });
    const enriched = await addMatch(u.id, 80, { createdAt: minutesAgo(5) });
    const bot = new FakeBot();
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 2, blocked: 0, failed: 0 });
    expect(bot.sent.map((m) => m.text.slice(0, 12))).toEqual([expect.stringContaining('85%'), expect.stringContaining('80%')]);
    expect(await notified([waiting, overdue, enriched])).toEqual(new Map([[waiting, false], [overdue, true], [enriched, true]]));
  });

  it('a message Telegram rejects for good (400) is marked and the rest still go out', async () => {
    const u = await makeUser('bad400');
    const [a, b, c] = [await addMatch(u.id, 90), await addMatch(u.id, 85), await addMatch(u.id, 80)] as [string, string, string];
    const bot = new FakeBot({ ok: false, blocked: false, status: 400 }, undefined, '85%');
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 2, blocked: 0, failed: 1 });
    expect(bot.sent).toHaveLength(3);
    expect([...(await notified([a, b, c])).values()].every(Boolean)).toBe(true);
    const { data } = await db.from('profiles').select('telegram_chat_id').eq('id', u.id).single();
    expect(data!.telegram_chat_id).toBe(u.chatId);
  });

  it('a rate limit (429) stops the user and leaves the rest for the next run', async () => {
    const u = await makeUser('rate429');
    const [a, b, c] = [await addMatch(u.id, 90), await addMatch(u.id, 85), await addMatch(u.id, 80)] as [string, string, string];
    const bot = new FakeBot({ ok: false, blocked: false, status: 429 }, undefined, '85%');
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 1, blocked: 0, failed: 1 });
    expect(await notified([a, b, c])).toEqual(new Map([[a, true], [b, false], [c, false]]));
  });

  it('a failing chat does not block other users; a non-403 failure leaves matches unmarked', async () => {
    const a = await makeUser('isoa');
    const b = await makeUser('isob');
    const ma = await addMatch(a.id, 90);
    const mb = await addMatch(b.id, 90);
    const bot = new FakeBot({ ok: false, blocked: false, status: 500 }, b.chatId);
    const res = await sendAlerts(db, { bot, siteUrl: 'https://example.test', now: new Date(), onlyUserIds: [a.id, b.id] });
    expect(res).toEqual({ users: 2, sent: 1, blocked: 0, failed: 1 });
    expect(await notified([ma, mb])).toEqual(new Map([[ma, true], [mb, false]]));
    const { data } = await db.from('profiles').select('telegram_chat_id').eq('id', b.id).single();
    expect(data!.telegram_chat_id).toBe(b.chatId);
  });

  it('unlinks the chat when the bot is blocked and leaves the match unmarked', async () => {
    const u = await makeUser('blocked');
    const m = await addMatch(u.id, 90);
    const bot = new FakeBot({ ok: false, blocked: true, status: 403 });
    expect(await run(sendAlerts, bot, u.id)).toEqual({ users: 1, sent: 0, blocked: 1, failed: 0 });
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
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 1, sent: 1, blocked: 0, failed: 0 });
    const text = bot.sent[0]!.text;
    expect(text).toContain('12 new jobs');
    expect(text.split('\n').filter((l) => l.startsWith('• ') && l.includes('%'))).toHaveLength(10);
    expect(text).toContain('DueCo');
    expect(text).not.toContain('LaterCo');
    const { data } = await db.from('profiles').select('digest_last_sent_on').eq('id', u.id).single();
    expect(data!.digest_last_sent_on).toBe('2026-10-08');

    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 0, sent: 0, blocked: 0, failed: 0 });
    expect(bot.sent).toHaveLength(1);
  });

  it('does nothing before the digest hour', async () => {
    const u = await makeUser('wronghour', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    const early = new Date('2026-10-08T04:10:00Z'); // 07:10 Kyiv
    await addMatch(u.id, 80, { createdAt: new Date(early.getTime() - 3600_000).toISOString() });
    const bot = new FakeBot();
    expect(await run(sendDigests, bot, u.id, early)).toEqual({ users: 0, sent: 0, blocked: 0, failed: 0 });
    expect(bot.sent).toHaveLength(0);
  });

  it('catches up later the same day, once', async () => {
    const u = await makeUser('catchup', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    const later = new Date('2026-10-08T07:10:00Z'); // 10:10 Kyiv
    await addMatch(u.id, 80, { createdAt: new Date(later.getTime() - 3600_000).toISOString() });
    const bot = new FakeBot();
    expect(await run(sendDigests, bot, u.id, later)).toEqual({ users: 1, sent: 1, blocked: 0, failed: 0 });
    expect(await run(sendDigests, bot, u.id, later)).toEqual({ users: 0, sent: 0, blocked: 0, failed: 0 });
    expect(bot.sent).toHaveLength(1);
  });

  it('does not count matches for stale jobs in the digest', async () => {
    const u = await makeUser('digeststale', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    await addMatch(u.id, 90, { createdAt: hoursAgo(1), firstSeenAt: hoursAgo(72) });
    await addMatch(u.id, 80, { createdAt: hoursAgo(1) });
    const bot = new FakeBot();
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 1, sent: 1, blocked: 0, failed: 0 });
    const text = bot.sent[0]!.text;
    expect(text).toContain('1 new job ');
    expect(text).toContain('80%');
    expect(text).not.toContain('90%');
  });

  it('sends the digest even with instant alerts off', async () => {
    const u = await makeUser('digestnoalerts', { timezone: 'Europe/Kyiv', digest_hour: 8, telegram_alerts: false });
    await addMatch(u.id, 80, { createdAt: hoursAgo(1) });
    const bot = new FakeBot();
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 1, sent: 1, blocked: 0, failed: 0 });
  });

  it('a failing chat does not block other users and is retried the same day', async () => {
    const a = await makeUser('dga', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    const b = await makeUser('dgb', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    await addMatch(a.id, 80, { createdAt: hoursAgo(1) });
    await addMatch(b.id, 80, { createdAt: hoursAgo(1) });
    const bot = new FakeBot({ ok: false, blocked: false, status: 500 }, b.chatId);
    const res = await sendDigests(db, { bot, siteUrl: 'https://example.test', now: at, onlyUserIds: [a.id, b.id] });
    expect(res).toEqual({ users: 2, sent: 1, blocked: 0, failed: 1 });
    const { data } = await db.from('profiles').select('id, digest_last_sent_on').in('id', [a.id, b.id]);
    const byId = new Map((data ?? []).map((r) => [r.id, r.digest_last_sent_on]));
    expect(byId.get(a.id)).toBe('2026-10-08');
    expect(byId.get(b.id)).toBeNull();
  });

  it('sends nothing when there is nothing to report, and does not recheck that day', async () => {
    const u = await makeUser('empty', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    const bot = new FakeBot();
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 1, sent: 0, blocked: 0, failed: 0 });
    expect(bot.sent).toHaveLength(0);
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 0, sent: 0, blocked: 0, failed: 0 });
  });

  it('unlinks the chat when the digest is blocked', async () => {
    const u = await makeUser('digestblocked', { timezone: 'Europe/Kyiv', digest_hour: 8 });
    await addMatch(u.id, 80, { createdAt: hoursAgo(1) });
    const bot = new FakeBot({ ok: false, blocked: true, status: 403 });
    expect(await run(sendDigests, bot, u.id, at)).toEqual({ users: 1, sent: 0, blocked: 1, failed: 0 });
    const { data } = await db.from('profiles').select('telegram_chat_id').eq('id', u.id).single();
    expect(data!.telegram_chat_id).toBeNull();
  });
});
