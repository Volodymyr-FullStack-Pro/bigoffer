import { alertMessage, digestMessage, overflowMessage, toTgLocale, type AlertJob, type BotApi } from '@jp/core';
import type { Db } from '../db';

/** `onlyUserIds` restricts the run to those users (tests; never set in production). */
export type TelegramDeps = { bot: BotApi; siteUrl: string; now: Date; onlyUserIds?: string[] };
export type TelegramResult = { users: number; sent: number; blocked: number };

const MAX_ALERTS = 5;
const FETCH_LIMIT = 50;
const DIGEST_TOP = 10;
const DAY_MS = 24 * 3600_000;

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
  companies: { name: string } | null;
};
type MatchRow = { id: string; score: number; explanation: unknown; jobs: JobRow | null };

const MATCH_SELECT = 'id, score, explanation, jobs!inner(title, location, remote_type, salary_raw, is_job, companies(name))';

const PROFILE_SELECT = 'id, locale, timezone, digest_hour, digest_last_sent_on, telegram_chat_id, telegram_min_score';

/** Users with a linked chat who have Telegram notifications on. */
async function linkedProfiles(db: Db, onlyUserIds?: string[]): Promise<Profile[]> {
  let query = db
    .from('profiles')
    .select(PROFILE_SELECT)
    .not('telegram_chat_id', 'is', null)
    .eq('telegram_alerts', true);
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

/** New, not-yet-notified matches of the last 24 hours with a real job posting, best first. */
function freshMatches(db: Db, userId: string, now: Date) {
  return db
    .from('job_matches')
    .select(MATCH_SELECT, { count: 'exact' })
    .eq('user_id', userId)
    .eq('state', 'new')
    .gte('created_at', new Date(now.getTime() - DAY_MS).toISOString())
    .or('is_job.is.null,is_job.eq.true', { referencedTable: 'jobs' })
    .order('score', { ascending: false });
}

async function dropChat(db: Db, userId: string): Promise<void> {
  await db.from('profiles').update({ telegram_chat_id: null }).eq('id', userId);
}

export async function sendAlerts(db: Db, deps: TelegramDeps): Promise<TelegramResult> {
  const result: TelegramResult = { users: 0, sent: 0, blocked: 0 };
  const profiles = await linkedProfiles(db, deps.onlyUserIds);
  for (const p of profiles) {
    const { data, error } = await freshMatches(db, p.id, deps.now)
      .is('notified_at', null)
      .gte('score', p.telegram_min_score)
      .limit(FETCH_LIMIT);
    if (error) throw error;
    const matches = (data ?? []) as unknown as MatchRow[];
    if (matches.length === 0) continue;
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
      } else {
        if (res.blocked) {
          result.blocked++;
          await dropChat(db, p.id);
        }
        stop = true;
        break;
      }
    }
    if (!stop && rest.length > 0) {
      const res = await deps.bot.sendMessage(p.telegram_chat_id, overflowMessage(rest.length, locale, deps.siteUrl));
      if (res.ok) {
        done.push(...rest.map((m) => m.id));
        result.sent++;
      } else if (res.blocked) {
        result.blocked++;
        await dropChat(db, p.id);
      }
    }
    if (done.length > 0) {
      const { error: markError } = await db.from('job_matches').update({ notified_at: deps.now.toISOString() }).in('id', done);
      if (markError) throw markError;
    }
  }
  return result;
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
 * Daily digest at the user's digest_hour. `digest_last_sent_on` is set whenever that hour was processed
 * (sent, or nothing to report), so an empty day is not rechecked; a failed send leaves it unset.
 */
export async function sendDigests(db: Db, deps: TelegramDeps): Promise<TelegramResult> {
  const result: TelegramResult = { users: 0, sent: 0, blocked: 0 };
  const profiles = await linkedProfiles(db, deps.onlyUserIds);
  for (const p of profiles) {
    const local = localTime(deps.now, p.timezone);
    if (!local || local.hour !== p.digest_hour || p.digest_last_sent_on === local.date) continue;
    result.users++;
    const markDone = () => db.from('profiles').update({ digest_last_sent_on: local.date }).eq('id', p.id);

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
      continue;
    }
    const msg = digestMessage({ total: count ?? top.length, top, followUps }, locale, deps.siteUrl);
    const res = await deps.bot.sendMessage(p.telegram_chat_id, msg.text, msg.replyMarkup);
    if (res.ok) {
      result.sent++;
      await markDone();
    } else if (res.blocked) {
      result.blocked++;
      await dropChat(db, p.id);
    }
  }
  return result;
}
