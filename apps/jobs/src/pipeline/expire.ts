import type { Db } from '../db';

export async function expireJobs(db: Db, now: Date, days = 14): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from('jobs')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('last_seen_at', cutoff)
    .select('id');
  if (error) throw error;
  return data.length;
}

/** Deletes jobs expired for `days` (and their matches, postings, kits) unless they sit on someone's board. */
export async function purgeExpiredJobs(db: Db, now: Date, days = 30): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db.rpc('purge_expired_jobs', { p_cutoff: cutoff });
  if (error) throw error;
  return data ?? 0;
}

/** A worker that died mid-run leaves its source_runs row 'running' forever; close such rows. */
export async function failStaleRuns(db: Db, now: Date, minutes = 60): Promise<number> {
  const cutoff = new Date(now.getTime() - minutes * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('source_runs')
    .update({ status: 'error', error: 'timed out', finished_at: now.toISOString() })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select('id');
  if (error) throw error;
  return data.length;
}
