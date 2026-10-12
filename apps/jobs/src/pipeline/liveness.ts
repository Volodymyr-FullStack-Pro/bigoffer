import type { SourceAdapter, AdapterContext } from '@jp/scrapers';
import type { Db } from '../db';

/** Boards whose adapters can tell a closed posting (see SourceAdapter.isOpen). */
export const LIVENESS_SOURCES = ['dou', 'djinni', 'robotaua'] as const;
const RECHECK_MS = 6 * 3600 * 1000;
const CONCURRENCY = 4;

export type LivenessResult = { checked: number; closed: number; unknown: number };

/**
 * Checks the jobs users currently see (visible matches), oldest check first, and expires the ones their board has
 * closed or removed. A job counts as closed only when every checkable posting says so; "can't tell" changes nothing.
 */
export async function checkLiveness(
  db: Db,
  deps: { adapters: Partial<Record<string, SourceAdapter>>; createContext: (sourceId: string) => AdapterContext; now?: Date; limit?: number; onlyJobIds?: string[] },
): Promise<LivenessResult> {
  const now = deps.now ?? new Date();
  const stale = new Date(now.getTime() - RECHECK_MS).toISOString();
  let query = db
    .from('jobs')
    .select('id, job_postings!inner(source_id, url), job_matches!inner(state)')
    .eq('status', 'active')
    .in('job_postings.source_id', [...LIVENESS_SOURCES])
    .in('job_matches.state', ['new', 'seen'])
    .or(`live_checked_at.is.null,live_checked_at.lt.${stale}`)
    .order('live_checked_at', { ascending: true, nullsFirst: true })
    .limit(deps.limit ?? 80);
  if (deps.onlyJobIds) query = query.in('id', deps.onlyJobIds);
  const { data, error } = await query;
  if (error) throw error;

  const result: LivenessResult = { checked: 0, closed: 0, unknown: 0 };
  const contexts = new Map<string, AdapterContext>();
  const ctxFor = (sourceId: string) => {
    let c = contexts.get(sourceId);
    if (!c) contexts.set(sourceId, (c = deps.createContext(sourceId)));
    return c;
  };
  for (let i = 0; i < data.length; i += CONCURRENCY) {
    await Promise.all(
      data.slice(i, i + CONCURRENCY).map(async (job) => {
        const verdicts = await Promise.all(
          job.job_postings.map(async (p) => {
            const adapter = deps.adapters[p.source_id];
            return adapter?.isOpen ? adapter.isOpen(p.url, ctxFor(p.source_id)) : null;
          }),
        );
        result.checked++;
        const known = verdicts.filter((v): v is boolean => v !== null);
        if (known.length === 0) {
          result.unknown++;
          return;
        }
        const closed = known.every((v) => v === false);
        const patch: { live_checked_at: string; status?: 'expired' } = closed ? { status: 'expired', live_checked_at: now.toISOString() } : { live_checked_at: now.toISOString() };
        const { error: updateError } = await db.from('jobs').update(patch).eq('id', job.id);
        if (updateError) throw updateError;
        if (closed) result.closed++;
      }),
    );
  }
  await Promise.all([...contexts.values()].map((c) => c.dispose?.().catch(() => undefined)));
  return result;
}
