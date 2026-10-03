import { defaultSources, scoreJob } from '@jp/core';
import type { Db } from '../db';
import { matchJobs } from './match';
import { deleteNewMatches, getActiveProfiles, getScorableJobs } from './repository';

/**
 * Re-scores stored jobs (e.g. after AI enrichment) for every active profile that polls a board the job was seen on,
 * and drops untouched matches that no longer score (not a job, no longer relevant).
 */
export async function rescoreJobs(db: Db, jobIds: string[]): Promise<number> {
  if (jobIds.length === 0) return 0;
  const [profiles, jobs] = await Promise.all([getActiveProfiles(db), getScorableJobs(db, jobIds)]);
  let matched = 0;
  for (const profile of profiles) {
    const enabled = new Set<string>(profile.sources ?? defaultSources(profile.remoteType));
    const eligible = jobs.filter((j) => j.sources.some((s) => enabled.has(s)));
    if (eligible.length === 0) continue;
    matched += await matchJobs(db, [profile], eligible);
    const stale = eligible.filter(({ job }) => scoreJob(profile, job) === null).map(({ jobId }) => jobId);
    await deleteNewMatches(db, profile.id, stale);
  }
  return matched;
}
