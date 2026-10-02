import { normalizeJob, type NormalizedJob } from '@jp/core';
import { type AdapterContext, SourceBlockedError, type SourceAdapter } from '@jp/scrapers';
import type { Db } from '../db';
import { matchJobs } from './match';
import {
  finishRun,
  getProfilesForQuery,
  getQuery,
  getSource,
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

export async function runQuery(deps: RunQueryDeps, queryId: string): Promise<RunQueryResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const query = await getQuery(db, queryId);
  if (!query) return SKIPPED;
  const source = await getSource(db, query.source_id);
  const adapter = deps.adapters[query.source_id];
  const paused = source.paused_until !== null && new Date(source.paused_until) > now;
  if (!source.enabled || !adapter || paused || adapter.isConfigured?.(deps.env ?? {}) === false) return SKIPPED;

  const runId = await startRun(db, source.id, queryId, now);
  try {
    const raw = await adapter.search(query.params as Record<string, string>, deps.createContext(source.id));
    const normalized = (await Promise.all(raw.map(normalizeJob))).filter((j): j is NormalizedJob => j !== null);

    let inserted = 0;
    const saved: { jobId: string; job: NormalizedJob }[] = [];
    for (const job of normalized) {
      const result = await saveJob(db, source.id, job, now);
      if (result.isNew) inserted++;
      saved.push({ jobId: result.jobId, job });
    }

    const matched = await matchJobs(db, await getProfilesForQuery(db, queryId), saved);
    await finishRun(db, runId, { status: 'ok', found: raw.length, inserted });
    const { alert } = await updateSourceHealth(db, source, raw.length === 0 ? 'empty' : 'ok', now);
    await markQueryRun(db, queryId, now, source.min_interval_minutes);
    return { status: 'ok', found: raw.length, inserted, matched, alert };
  } catch (err) {
    if (err instanceof SourceBlockedError) {
      await finishRun(db, runId, { status: 'blocked', found: 0, inserted: 0, error: err.message });
      const { alert } = await updateSourceHealth(db, source, 'blocked', now);
      await markQueryRun(db, queryId, now, source.min_interval_minutes);
      return { status: 'blocked', found: 0, inserted: 0, matched: 0, alert };
    }
    await finishRun(db, runId, {
      status: 'error',
      found: 0,
      inserted: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
