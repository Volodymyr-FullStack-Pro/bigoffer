import { BOARD_SOURCE_IDS, normalizeJob, type NormalizedJob, PREFILTERED_SOURCE_IDS, type ScorableJob, type SourceId, wantedByAnyProfile } from '@jp/core';
import { type AdapterContext, SourceBlockedError, type SourceAdapter } from '@jp/scrapers';
import type { Db } from '../db';
import { recordBoardRun } from './boards';
import { matchJobs } from './match';
import {
  deferQuery,
  finishRun,
  getProfilesForQuery,
  getQuery,
  getSource,
  DUE_WINDOW_MS,
  getScorableJobs,
  markQueryRun,
  saveJob,
  startRun,
  updateSourceHealth,
} from './repository';

export type RunQueryDeps = {
  db: Db;
  adapters: Record<string, SourceAdapter>;
  createContext: (sourceId: string) => AdapterContext;
  env?: Record<string, string | undefined>;
  /** Scales every source's min interval (cost control); 1 when omitted. */
  intervalMultiplier?: number;
  now?: () => Date;
};

export type RunQueryResult = {
  status: 'ok' | 'skipped' | 'blocked';
  found: number;
  inserted: number;
  matched: number;
  alert: string | null;
};

const SKIPPED: RunQueryResult = { status: 'skipped', found: 0, inserted: 0, matched: 0, alert: null };

// Board bookkeeping is extra: a failure to record must never change the run's outcome.
function boardOf(sourceId: string, params: unknown): string | null {
  const board = (params as { board?: unknown } | null)?.board;
  return typeof board === 'string' && BOARD_SOURCE_IDS.has(sourceId as SourceId) ? board : null;
}

async function trackBoard(db: Db, sourceId: string, params: unknown, ok: boolean): Promise<void> {
  const board = boardOf(sourceId, params);
  if (board === null) return;
  try {
    await recordBoardRun(db, sourceId, board, ok);
  } catch (e) {
    console.error('board bookkeeping failed', e);
  }
}

/** The scorer's view of a freshly scraped job (before AI enrichment: no skills, role or is_job yet). */
export function scorableFromNormalized(job: NormalizedJob): ScorableJob {
  return {
    title: job.title,
    descriptionText: job.descriptionText,
    tags: job.tags,
    remoteType: job.remoteType,
    seniority: job.seniority,
    location: job.location,
    salaryMinUsd: job.salaryMinUsd,
    salaryMaxUsd: job.salaryMaxUsd,
    remoteRegions: job.remoteRegions,
  };
}

export async function runQuery(deps: RunQueryDeps, queryId: string): Promise<RunQueryResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const query = await getQuery(db, queryId);
  if (!query) return SKIPPED;
  // A duplicate enqueue of a query that already ran: its next_run_at has moved on. No bookkeeping.
  if (new Date(query.next_run_at).getTime() > now.getTime() + DUE_WINDOW_MS) return SKIPPED;
  const source = await getSource(db, query.source_id);
  const adapter = deps.adapters[query.source_id];

  // Every skip still moves next_run_at forward, so skipped queries can't starve the scheduler.
  if (source.paused_until !== null && new Date(source.paused_until) > now) {
    await deferQuery(db, queryId, source.paused_until);
    return SKIPPED;
  }
  if (!source.enabled || !adapter || adapter.isConfigured?.(deps.env ?? {}) === false) {
    await markQueryRun(db, queryId, now, source.min_interval_minutes, deps.intervalMultiplier);
    return SKIPPED;
  }

  const ctx = deps.createContext(source.id);
  try {
    const runId = await startRun(db, source.id, queryId, now);
    let found: number;
    let inserted = 0;
    let matched: number;
    try {
      const raw = await adapter.search(query.params as Record<string, string>, ctx);
      const normalized = (await Promise.all(raw.map(normalizeJob))).filter((j): j is NormalizedJob => j !== null);
      const profiles = await getProfilesForQuery(db, queryId);
      // Whole-board feeds are mostly other roles: store only what some profile would actually show.
      const toSave = PREFILTERED_SOURCE_IDS.has(source.id as SourceId)
        ? normalized.filter((job) => wantedByAnyProfile(profiles, scorableFromNormalized(job)))
        : normalized;

      const savedIds: string[] = [];
      for (const job of toSave) {
        const result = await saveJob(db, source.id, job, now);
        if (result.isNew) inserted++;
        savedIds.push(result.jobId);
      }

      // Match on what is stored (AI skills, is_job, remote_regions), not on the raw source data.
      matched = await matchJobs(db, profiles, await getScorableJobs(db, savedIds));
      found = raw.length;
    } catch (err) {
      const board = boardOf(source.id, query.params);
      // One board that answers 403 is that board's failure (it gets disabled after repeated ones); it must not
      // pause every other board of the same ATS. A 429 is rate limiting of the whole source and still pauses it.
      if (err instanceof SourceBlockedError && board !== null && err.status === 403) {
        try {
          await finishRun(db, runId, { status: 'error', found: 0, inserted: 0, error: err.message });
          await markQueryRun(db, queryId, now, source.min_interval_minutes, deps.intervalMultiplier);
        } catch {
          // ignored: the board failure below is what matters
        }
        await trackBoard(db, source.id, query.params, false);
        return { status: 'blocked', found: 0, inserted: 0, matched: 0, alert: null };
      }
      if (err instanceof SourceBlockedError) {
        await finishRun(db, runId, { status: 'blocked', found: 0, inserted: 0, error: err.message });
        const { alert } = await updateSourceHealth(db, source, 'blocked', now);
        await markQueryRun(db, queryId, now, source.min_interval_minutes, deps.intervalMultiplier);
        return { status: 'blocked', found: 0, inserted: 0, matched: 0, alert };
      }
      // Record the failure and push the query forward, but never mask the original error.
      try {
        await finishRun(db, runId, {
          status: 'error',
          found: 0,
          inserted,
          error: err instanceof Error ? err.message : String(err),
        });
        await markQueryRun(db, queryId, now, source.min_interval_minutes, deps.intervalMultiplier);
      } catch {
        // ignored: the original error below is what matters
      }
      await trackBoard(db, source.id, query.params, false);
      throw err;
    }

    // Bookkeeping after a successful fetch lives outside the try so its failure can't turn an 'ok' run into 'error'.
    await finishRun(db, runId, { status: 'ok', found, inserted });
    const { alert } = await updateSourceHealth(
      db,
      source,
      // A board with no technical roles is normal, so only whole-source feeds count empty runs.
      found === 0 && !BOARD_SOURCE_IDS.has(source.id as SourceId) ? 'empty' : 'ok',
      now,
    );
    await markQueryRun(db, queryId, now, source.min_interval_minutes, deps.intervalMultiplier);
    await trackBoard(db, source.id, query.params, true);
    return { status: 'ok', found, inserted, matched, alert };
  } finally {
    await ctx.dispose?.().catch((e: unknown) => console.error('dispose failed', e));
  }
}
