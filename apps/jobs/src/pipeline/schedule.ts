import type { SourceAdapter } from '@jp/scrapers';
import type { Db } from '../db';

type Due = { id: string; sourceId: string; nextRunAt: string };

/**
 * Drops due queries whose adapter is not configured (e.g. missing API key) and pushes them forward in bulk,
 * one update per source, so the scheduler never triggers a run that would do nothing.
 */
export async function deferUnconfigured(
  db: Db,
  due: Due[],
  adapters: Partial<Record<string, SourceAdapter>>,
  env: Record<string, string | undefined>,
  now: Date,
  multiplier = 1,
): Promise<Due[]> {
  const isSkipped = (q: Due) => adapters[q.sourceId]?.isConfigured?.(env) === false;
  const skipped = due.filter(isSkipped);
  if (skipped.length === 0) return due;

  const bySource = new Map<string, string[]>();
  for (const q of skipped) bySource.set(q.sourceId, [...(bySource.get(q.sourceId) ?? []), q.id]);
  const { data: sources, error } = await db
    .from('sources')
    .select('id, min_interval_minutes')
    .in('id', [...bySource.keys()]);
  if (error) throw error;
  for (const s of sources) {
    const next = new Date(now.getTime() + Math.max(s.min_interval_minutes, 15) * multiplier * 60 * 1000);
    const { error: updateError } = await db
      .from('search_queries')
      .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString() })
      .in('id', bySource.get(s.id)!);
    if (updateError) throw updateError;
  }
  return due.filter((q) => !isSkipped(q));
}
