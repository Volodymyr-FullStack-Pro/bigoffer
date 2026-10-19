import { alertLabels, errorText, alertMessage, ensureBotCommands, detectDomains, detectPerks, digestGenieLines, digestMessage, streaks, weekLines, inQuietHours, overflowMessage, sourceInfo, toTgLocale, type AlertJob, type BotApi, type BotResult, type TgLocale } from '@jp/core';
import type { Db } from '../db';

/** `onlyUserIds` restricts the run to those users (tests; never set in production). */
export type TelegramDeps = { bot: BotApi; siteUrl: string; now: Date; onlyUserIds?: string[] };
export type TelegramResult = { users: number; sent: number; blocked: number; failed: number };

const MAX_ALERTS = 5;
const FETCH_LIMIT = 50;
const DIGEST_TOP = 10;
const DAY_MS = 24 * 3600_000;
/**
 * An alert waits for AI enrichment (summary, is_job) this long at most, so alerts still flow when AI is off or
 * behind. Kept short: replies go to the first applicants.
 */
const ENRICH_WAIT_MS = 10 * 60_000;

type Profile = {
  id: string;
  locale: string;
  timezone: string;
  digest_hour: number;
  digest_last_sent_on: string | null;
  telegram_chat_id: number;
  telegram_min_score: number;
  telegram_quiet_start: number;
  telegram_quiet_end: number;
  telegram_paused_until: string | null;
  ui_prefs: unknown;
};

type JobRow = {
  title: string;
  description_text?: string;
  seniority?: string | null;
  location: string | null;
  remote_type: string;
  salary_raw: string | null;
  enriched_at: string | null;
  companies: { name: string } | null;
  job_postings?: { source_id: string; url: string; seen_at: string }[];
};
type MatchRow = { id: string; score: number; explanation: unknown; created_at: string; jobs: JobRow | null };

const MATCH_SELECT =
  'id, score, explanation, created_at, jobs!inner(title, description_text, seniority, location, remote_type, salary_raw, is_job, enriched_at, companies(name), job_postings(source_id, url, seen_at))';

const PROFILE_SELECT =
  'id, locale, timezone, digest_hour, digest_last_sent_on, telegram_chat_id, telegram_min_score, telegram_quiet_start, telegram_quiet_end, telegram_paused_until, ui_prefs';

/** Users with a linked chat; instant alerts additionally require telegram_alerts (the digest does not). */
async function linkedProfiles(db: Db, onlyUserIds: string[] | undefined, alertsOnly: boolean): Promise<Profile[]> {
  let query = db.from('profiles').select(PROFILE_SELECT).not('telegram_chat_id', 'is', null);
  if (alertsOnly) query = query.eq('telegram_alerts', true);
  if (onlyUserIds) query = query.in('id', onlyUserIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}

function jobFacts(job: JobRow) {
  const text = { title: job.title, company: job.companies?.name ?? null, descriptionText: job.description_text ?? '' };
  return { domains: detectDomains(text), perks: detectPerks(text), seniority: job.seniority ?? null };
}

/** The feed's "No army" filter applies to Telegram too. */
function wantsNoArmy(p: Profile): boolean {
  const feed = (p.ui_prefs as { feed?: { noArmy?: unknown } } | null)?.feed;
  return feed?.noArmy === true;
}

function toAlertJob(m: MatchRow, locale: TgLocale): AlertJob {
  const job = m.jobs!;
  // The most recently seen posting is the one most likely still open.
  const posting = [...(job.job_postings ?? [])].sort((a, b) => (a.seen_at < b.seen_at ? 1 : -1))[0];
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
    source: posting ? (sourceInfo(posting.source_id)?.name ?? posting.source_id) : null,
    jobUrl: posting?.url ?? null,
    labels: alertLabels(jobFacts(job), locale),
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
  console.error(`[telegram] ${what} failed`, errorText(err));
}

export async function sendAlerts(db: Db, deps: TelegramDeps): Promise<TelegramResult> {
  const result: TelegramResult = { users: 0, sent: 0, blocked: 0, failed: 0 };
  // The command menu exists even for users who never message the bot.
  await ensureBotCommands(deps.bot);
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
  // Paused (/pause) or quiet hours: matches stay un-notified and go out on the first run after.
  if (p.telegram_paused_until && Date.parse(p.telegram_paused_until) > deps.now.getTime()) return;
  const local = localTime(deps.now, p.timezone);
  if (local && inQuietHours(local.hour, p.telegram_quiet_start, p.telegram_quiet_end)) return;
  const { data, error } = await freshMatches(db, p.id, deps.now)
    .is('notified_at', null)
    .gte('score', p.telegram_min_score)
    .limit(FETCH_LIMIT);
  if (error) throw error;
  const ready = ((data ?? []) as unknown as MatchRow[]).filter((m) => readyToAlert(m, deps.now));
  // Army-service jobs are skipped (and marked, so they are not checked again) when the feed hides them.
  const skipped = wantsNoArmy(p) ? ready.filter((m) => m.jobs && jobFacts(m.jobs).domains.includes('military')) : [];
  if (skipped.length > 0) await markNotified(db, skipped.map((m) => m.id), deps.now);
  const matches = ready.filter((m) => !skipped.includes(m));
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
  const genie = await genieDigest(db, p, date, locale);
  // Mondays open with the week in numbers.
  const week = new Date(`${date}T12:00:00Z`).getUTCDay() === 1 ? await weekDigest(db, p.id, deps.now, locale) : [];
  if (week.length > 0) genie.lines.unshift(...week, '');
  // An idle-days nudge is worth a message even when nothing new came in.
  if (top.length === 0 && followUps.length === 0 && !genie.nudge && week.length === 0) {
    await markDone();
    return;
  }
  const msg = digestMessage({ total: count ?? top.length, top, followUps, genie: genie.lines }, locale, deps.siteUrl);
  const res = await deps.bot.sendMessage(p.telegram_chat_id, msg.text, msg.replyMarkup);
  if (res.ok) {
    result.sent++;
    await markDone();
  } else if (res.blocked) {
    result.blocked++;
    await dropChat(db, p.id);
  } else result.failed++;
}

/** Applications sent, answers, interview invites and closed cards over the seven days before `now`. */
async function weekDigest(db: Db, userId: string, now: Date, locale: TgLocale): Promise<string[]> {
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const { data, error } = await db
    .from('applications')
    .select('applied_at, first_response_at, reply_kind, outcome, updated_at')
    .eq('user_id', userId)
    .or(`applied_at.gte.${since},first_response_at.gte.${since},updated_at.gte.${since}`);
  if (error) throw error;
  const rows = data ?? [];
  const inWeek = (at: string | null) => at !== null && at >= since;
  return weekLines(
    {
      applied: rows.filter((a) => inWeek(a.applied_at)).length,
      answered: rows.filter((a) => inWeek(a.first_response_at)).length,
      interviews: rows.filter((a) => a.reply_kind === 'interview_invite' && inWeek(a.updated_at)).length,
      closed: rows.filter((a) => a.outcome !== 'open' && inWeek(a.updated_at)).length,
    },
    locale,
  );
}

/** Yesterday's applications against the Offer Genie goal (unless the genie is off), in the user's time zone. */
async function genieDigest(db: Db, p: Profile, today: string, locale: TgLocale): Promise<{ lines: string[]; nudge: boolean }> {
  const genie = (p.ui_prefs as { genie?: { mode?: unknown; goal?: unknown } } | null)?.genie;
  if (genie?.mode === 'off') return { lines: [], nudge: false };
  const goal = typeof genie?.goal === 'number' && genie.goal > 0 ? genie.goal : 5;
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 16 * DAY_MS).toISOString();
  const { data, error } = await db.from('applications').select('applied_at').eq('user_id', p.id).gte('applied_at', since);
  if (error) throw error;
  const dates = (data ?? []).flatMap((a) => (a.applied_at ? [localTime(new Date(a.applied_at), p.timezone)?.date ?? ''] : [])).filter(Boolean);
  if (dates.length === 0) return { lines: [], nudge: false };
  const back = new Date(`${today}T12:00:00Z`);
  back.setUTCDate(back.getUTCDate() - 1);
  const yesterday = back.toISOString().slice(0, 10);
  const { streak, idleDays } = streaks(dates.filter((d) => d !== today), today, goal);
  return {
    lines: digestGenieLines({ yesterday: dates.filter((d) => d === yesterday).length, goal, streak, idleDays }, locale, Number(today.replaceAll('-', ''))),
    nudge: idleDays >= 2,
  };
}
