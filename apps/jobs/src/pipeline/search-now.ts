import type { SourceAdapter } from '@jp/scrapers';
import type { Db } from '../db';
import { getActiveProfilesOfUser } from './repository';
import { deferUnconfigured } from './schedule';
import { syncProfile } from './sync-profiles';

export type DueQuery = { id: string; sourceId: string; nextRunAt: string };

/**
 * "Find jobs now" for one user: re-link and re-match their active profiles, then pull every query of those profiles
 * forward to `now` so it is scraped immediately. Paused and disabled sources are left alone (runQuery would skip
 * them anyway); unconfigured ones (no API key) are deferred like the hourly scheduler does.
 */
export async function prepareSearchNow(
  db: Db,
  userId: string,
  now: Date,
  deps: { adapters: Partial<Record<string, SourceAdapter>>; env: Record<string, string | undefined>; intervalMultiplier?: number },
): Promise<{ profiles: number; due: DueQuery[] }> {
  const profiles = await getActiveProfilesOfUser(db, userId);
  if (profiles.length === 0) return { profiles: 0, due: [] };
  const queryIds = new Set<string>();
  for (const profile of profiles) for (const id of (await syncProfile(db, profile, now)).queryIds) queryIds.add(id);
  if (queryIds.size === 0) return { profiles: profiles.length, due: [] };

  return { profiles: profiles.length, due: await pullForward(db, [...queryIds], now, deps) };
}

type Deps = { adapters: Partial<Record<string, SourceAdapter>>; env: Record<string, string | undefined>; intervalMultiplier?: number };

/** Brings these queries' next run forward to now and returns them as due (paused/disabled/unconfigured left out). */
async function pullForward(db: Db, ids: string[], now: Date, deps: Deps, onlyNeverRun = false): Promise<DueQuery[]> {
  if (ids.length === 0) return [];
  const nowIso = now.toISOString();
  let query = db.from('search_queries').select('id, source_id, next_run_at, sources!inner(enabled, paused_until)').in('id', ids).eq('sources.enabled', true);
  if (onlyNeverRun) query = query.is('last_run_at', null);
  const { data, error } = await query;
  if (error) throw error;
  const runnable = data.filter((q) => !q.sources.paused_until || q.sources.paused_until <= nowIso);
  const later = runnable.filter((q) => q.next_run_at > nowIso).map((q) => q.id);
  for (let i = 0; i < later.length; i += 200) {
    const { error: updateError } = await db.from('search_queries').update({ next_run_at: nowIso }).in('id', later.slice(i, i + 200));
    if (updateError) throw updateError;
  }
  const due = runnable.map((q) => ({ id: q.id, sourceId: q.source_id, nextRunAt: q.next_run_at > nowIso ? nowIso : q.next_run_at }));
  return deferUnconfigured(db, due, deps.adapters, deps.env, now, deps.intervalMultiplier);
}

/**
 * After a profile is saved: queries that have never run (a new keyword or board) are scraped right away instead of
 * waiting for the next scheduler tick. Queries that already ran keep their cadence (no rate limit to bypass).
 */
export async function dueNewQueries(db: Db, queryIds: string[], now: Date, deps: Deps): Promise<DueQuery[]> {
  return pullForward(db, queryIds, now, deps, true);
}
