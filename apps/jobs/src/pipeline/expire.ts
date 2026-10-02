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
