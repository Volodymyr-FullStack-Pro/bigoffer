import { alertMessage, digestMessage, overflowMessage, toTgLocale, type AlertJob, type BotApi, type BotResult } from '@jp/core';
import type { Db } from '../db';

/** `onlyUserIds` restricts the run to those users (tests; never set in production). */
export type TelegramDeps = { bot: BotApi; siteUrl: string; now: Date; onlyUserIds?: string[] };
export type TelegramResult = { users: number; sent: number; blocked: number; failed: number };

const MAX_ALERTS = 5;
const FETCH_LIMIT = 50;
const DIGEST_TOP = 10;
const DAY_MS = 24 * 3600_000;
/** An alert waits for AI enrichment (summary, is_job) this long at most, so alerts still flow when AI is off or behind. */
const ENRICH_WAIT_MS = 45 * 60_000;

type Profile = {
  id: string;
  locale: string;
  timezone: string;
  digest_hour: number;
  digest_last_sent_on: string | null;
  telegram_chat_id: number;
  telegram_min_score: number;
};

type JobRow = {
  title: string;
  location: string | null;
  remote_type: string;
  salary_raw: string | null;
  enriched_at: string | null;
  companies: { name: string } | null;
};
type MatchRow = { id: string; score: number; explanation: unknown; created_at: string; jobs: JobRow | null };

const MATCH_SELECT =
  'id, score, explanation, created_at, jobs!inner(title, location, remote_type, salary_raw, is_job, enriched_at, companies(name))';

const PROFILE_SELECT = 'id, locale, timezone, digest_hour, digest_last_sent_on, telegram_chat_id, telegram_min_score';

/** Users with a linked chat; instant alerts additionally require telegram_alerts (the digest does not). */
async function linkedProfiles(db: Db, onlyUserIds: string[] | undefined, alertsOnly: boolean): Promise<Profile[]> {
  let query = db.from('profiles').select(PROFILE_SELECT).not('telegram_chat_id', 'is', null);
  if (alertsOnly) query = query.eq('telegram_alerts', true);
  if (onlyUserIds) query = query.in('id', onlyUserIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}

function toAlertJob(m: MatchRow, locale: string): AlertJob {
  const job = m.jobs!;
  const expl = m.explanation && typeof m.explanation === 'object' ? (m.explanation as Record<string, unknown>)[locale] : null;
  return {
    matchId: m.id,
    title: job.title,
    company: job.companies?.name ?? null,
    score: m.score,
    salary: job.salary_raw,
    location: job.location,
    remote: job.remote_type === 'unknown' ? null : job.remote_type,
    why: typeof expl === 'string' && expl.trim() ? expl : null,
  };
}

/**
 * New matches of the last 24 hours for active, real job postings that are themselves fresh — posted within 24 hours,
 * or (no posted_at) first seen within 24 hours, the same rule as Today's "New in 24h" — best first.
 */
function freshMatches(db: Db, userId: string, now: Date) {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  return db
    .from('job_matches')
    .select(MATCH_SELECT, { count: 'exact' })
    .eq('user_id', userId)
    .eq('state', 'new')
    .gte('created_at', since)
    .eq('jobs.status', 'active')
    .not('jobs.is_job', 'is', false)
    .or(`posted_at.gte.${since},and(posted_at.is.null,first_seen_at.gte.${since})`, { referencedTable: 'jobs' })
    .order('score', { ascending: false });
}

/** Alert once the job is enriched (summary, is_job known), or after ENRICH_WAIT_MS regardless. */
function readyToAlert(m: MatchRow, now: Date): boolean {
  return m.jobs?.enriched_at != null || Date.parse(m.created_at) <= now.getTime() - ENRICH_WAIT_MS;
}

/** A 4xx other than 403 (blocked) and 429 (rate limit) is about this message itself: retrying cannot help. */
function rejectedForGood(res: BotResult): boolean {
  return !res.ok && !res.blocked && res.status >= 400 && res.status < 500 && res.status !== 429;
}

async function dropChat(db: Db, userId: string): Promise<void> {
  await db.from('profiles').update({ telegram_chat_id: null }).eq('id', userId);
}

/** Marks matches as notified; retries once, since a lost mark would send the same alerts again. */
async function markNotified(db: Db, ids: string[], now: Date): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await db.from('job_matches').update({ notified_at: now.toISOString() }).in('id', ids);
    if (!error) return true;
  }
  return false;
}

function logFailure(what: string, err: unknown): void {
  console.error(`[telegram] ${what} failed`, err instanceof Error ? err.message : String(err));
}

export async function sendAlerts(db: Db, deps: TelegramDeps): Promise<TelegramResult> {
  const result: TelegramResult = { users: 0, sent: 0, blocked: 0, failed: 0 };
  const profiles = await linkedProfiles(db, deps.onlyUserIds, true);
  for (const p of profiles) {
    try {
      await alertUser(db, deps, p, result);
    } catch (err) {
      result.failed++;
      logFailure('alerts for a user', err);
    }
  }
  return result;
}

async function alertUser(db: Db, deps: TelegramDeps, p: Profile, result: TelegramResult): Promise<void> {
  const { data, error } = await freshMatches(db, p.id, deps.now)
    .is('notified_at', null)
    .gte('score', p.telegram_min_score)
    .limit(FETCH_LIMIT);
  if (error) throw error;
  const matches = ((data ?? []) as unknown as MatchRow[]).filter((m) => readyToAlert(m, deps.now));
  if (matches.length === 0) return;
  result.users++;
  const locale = toTgLocale(p.locale);
  const shown = matches.slice(0, MAX_ALERTS);
  const rest = matches.slice(MAX_ALERTS);
  const done: string[] = [];
  let stop = false;
  for (const m of shown) {
    const msg = alertMessage(toAlertJob(m, locale), locale, deps.siteUrl);
    const res = await deps.bot.sendMessage(p.telegram_chat_id, msg.text, msg.replyMarkup);
    if (res.ok) {
      done.push(m.id);
      result.sent++;
    } else if (rejectedForGood(res)) {
      // Mark it anyway so one bad message does not block this user's queue; move on to the next.
      done.push(m.id);
      result.failed++;
      logFailure('an alert', `Bot API ${res.status}`);
    } else {
      if (res.blocked) {
        result.blocked++;
        await dropChat(db, p.id);
      } else result.failed++;
      stop = true;
      break;
    }
  }
  if (!stop && rest.length > 0) {
    const res = await deps.bot.sendMessage(p.telegram_chat_id, overflowMessage(rest.length, locale, deps.siteUrl));
    if (res.ok || rejectedForGood(res)) {
      done.push(...rest.map((m) => m.id));
      if (res.ok) result.sent++;
      else result.failed++;
    } else if (res.blocked) {
      result.blocked++;
      await dropChat(db, p.id);
    } else result.failed++;
  }
  if (done.length > 0 && !(await markNotified(db, done, deps.now))) {
    result.failed++;
    logFailure('marking notified matches', 'update error');
  }
}

/** Local hour (0-23) and ISO date (YYYY-MM-DD) in a time zone; null for an invalid zone. */
export function localTime(now: Date, timeZone: string): { hour: number; date: string } | null {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
        .formatToParts(now)
        .find((part) => part.type === 'hour')?.value,
    );
    const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return Number.isFinite(hour) ? { hour, date } : null;
  } catch {
    return null;
  }
}

/**
 * Daily digest: sent once per local day once the user's local hour reaches digest_hour (catch-up, so a missed
 * hourly run still delivers later that day). `digest_last_sent_on` is set whenever the day was processed
 * (sent, or nothing to report), so an empty day is not rechecked; a failed send leaves it unset and is retried.
 * Independent of telegram_alerts (that toggle only controls instant alerts).
 */
export async function sendDigests(db: Db, deps: TelegramDeps): Promise<TelegramResult> {
  const result: TelegramResult = { users: 0, sent: 0, blocked: 0, failed: 0 };
  const profiles = await linkedProfiles(db, deps.onlyUserIds, false);
  for (const p of profiles) {
    const local = localTime(deps.now, p.timezone);
    if (!local || local.hour < p.digest_hour || p.digest_last_sent_on === local.date) continue;
    try {
      await digestUser(db, deps, p, local.date, result);
    } catch (err) {
      result.failed++;
      logFailure('digest for a user', err);
    }
  }
  return result;
}

async function digestUser(db: Db, deps: TelegramDeps, p: Profile, date: string, result: TelegramResult): Promise<void> {
  result.users++;
  const markDone = async () => {
    const { error } = await db.from('profiles').update({ digest_last_sent_on: date }).eq('id', p.id);
    if (error) throw error;
  };
  const { data, count, error } = await freshMatches(db, p.id, deps.now).limit(DIGEST_TOP);
  if (error) throw error;
  const { data: apps, error: appsError } = await db
    .from('applications')
    .select('company, title')
    .eq('user_id', p.id)
    .eq('outcome', 'open')
    .lte('next_action_at', deps.now.toISOString())
    .order('next_action_at', { ascending: true })
    .limit(DIGEST_TOP);
  if (appsError) throw appsError;

  const locale = toTgLocale(p.locale);
  const top = ((data ?? []) as unknown as MatchRow[]).map((m) => toAlertJob(m, locale));
  const followUps = apps ?? [];
  if (top.length === 0 && followUps.length === 0) {
    await markDone();
    return;
  }
  const msg = digestMessage({ total: count ?? top.length, top, followUps }, locale, deps.siteUrl);
  const res = await deps.bot.sendMessage(p.telegram_chat_id, msg.text, msg.replyMarkup);
  if (res.ok) {
    result.sent++;
    await markDone();
  } else if (res.blocked) {
    result.blocked++;
    await dropChat(db, p.id);
  } else result.failed++;
}
