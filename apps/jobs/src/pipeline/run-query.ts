import { DEFAULT_MAX_BACKOFF, errorText, MAX_BACKOFF, normalizeJob, type NormalizedJob, queryBackoff, type ScorableJob } from '@jp/core';
import { type AdapterContext, SourceBlockedError, type SourceAdapter } from '@jp/scrapers';
import type { Db } from '../db';
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
  recentInserted,
  knownExternalIds,
  saveJobs,
  startRun,
  updateSourceHealth,
} from './repository';

export type RunQueryDeps = {
  db: Db;
  adapters: Record<string, SourceAdapter>;
  createContext: (sourceId: string) => AdapterContext;
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

/** `force`: run even though the query is not due (the radar saw a new posting in its feed). */
export async function runQuery(deps: RunQueryDeps, queryId: string, opts: { force?: boolean } = {}): Promise<RunQueryResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const query = await getQuery(db, queryId);
  if (!query) return SKIPPED;
  // A duplicate enqueue of a query that already ran: its next_run_at has moved on. No bookkeeping.
  if (!opts.force && new Date(query.next_run_at).getTime() > now.getTime() + DUE_WINDOW_MS) return SKIPPED;
  const source = await getSource(db, query.source_id);
  const adapter = deps.adapters[query.source_id];

  // Every skip still moves next_run_at forward, so skipped queries can't starve the scheduler.
  if (source.paused_until !== null && new Date(source.paused_until) > now) {
    await deferQuery(db, queryId, source.paused_until);
    return SKIPPED;
  }
  if (!source.enabled || !adapter) {
    await markQueryRun(db, queryId, now, source.min_interval_minutes);
    return SKIPPED;
  }

  const base = deps.createContext(source.id);
  // Lets an adapter skip re-reading pages of postings it has already stored (they still count as seen).
  const ctx: AdapterContext = { ...base, knownIds: base.knownIds ?? ((ids) => knownExternalIds(db, source.id, ids)) };
  try {
    const runId = await startRun(db, source.id, queryId, now);
    let found: number;
    let inserted = 0;
    let matched: number;
    try {
      const raw = await adapter.search(query.params as Record<string, string>, ctx);
      const normalized = (await Promise.all(raw.map(normalizeJob))).filter((j): j is NormalizedJob => j !== null);
      const profiles = await getProfilesForQuery(db, queryId);

      const saved = await saveJobs(db, source.id, normalized, now);
      inserted = saved.filter((r) => r.isNew).length;
      const savedIds = saved.map((r) => r.jobId);

      // Match on what is stored (AI skills, is_job, remote_regions), not on the raw source data.
      matched = await matchJobs(db, profiles, await getScorableJobs(db, savedIds));
      found = raw.length;
    } catch (err) {
      if (err instanceof SourceBlockedError) {
        await finishRun(db, runId, { status: 'blocked', found: 0, inserted: 0, error: err.message });
        const { alert } = await updateSourceHealth(db, source, 'blocked', now);
        await markQueryRun(db, queryId, now, source.min_interval_minutes);
        return { status: 'blocked', found: 0, inserted: 0, matched: 0, alert };
      }
      // Record the failure and push the query forward, but never mask the original error.
      try {
        await finishRun(db, runId, {
          status: 'error',
          found: 0,
          inserted,
          error: errorText(err),
        });
        await markQueryRun(db, queryId, now, source.min_interval_minutes);
      } catch {
        // ignored: the original error below is what matters
      }
      throw err;
    }

    // Bookkeeping after a successful fetch lives outside the try so its failure can't turn an 'ok' run into 'error'.
    await finishRun(db, runId, { status: 'ok', found, inserted });
    // Synonym searches that keep returning the same postings are checked less often (see queryBackoff).
    const backoff = queryBackoff(await recentInserted(db, queryId, 6), MAX_BACKOFF[source.id] ?? DEFAULT_MAX_BACKOFF);
    const { alert } = await updateSourceHealth(
      db,
      source,
      found === 0 ? 'empty' : 'ok',
      now,
    );
    await markQueryRun(db, queryId, now, source.min_interval_minutes * backoff);
    return { status: 'ok', found, inserted, matched, alert };
  } finally {
    await ctx.dispose?.().catch((e: unknown) => console.error('dispose failed', e));
  }
}
