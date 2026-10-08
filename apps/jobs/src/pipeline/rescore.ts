import { defaultSources, type SearchProfile, scoreJob } from '@jp/core';
import type { Db } from '../db';
import { bestMatchRows, saveMatchRows } from './match';
import { deleteNewMatches, getActiveProfiles, getScorableJobs } from './repository';

export type RescoreOptions = {
  /** Active profiles loaded once by the caller (saves a query per call when rescoring job by job). */
  profiles?: SearchProfile[];
  /** Only rescore for these users (tests, targeted runs). */
  onlyUserIds?: string[];
};

/**
 * Re-scores stored jobs (e.g. after AI enrichment) for every active profile that polls a board the job was seen on,
 * keeping the best profile per (user, job), and drops untouched matches that no longer score (not a job, no longer relevant).
 */
export async function rescoreJobs(db: Db, jobIds: string[], opts: RescoreOptions = {}): Promise<number> {
  if (jobIds.length === 0) return 0;
  const [allProfiles, jobs] = await Promise.all([opts.profiles ?? getActiveProfiles(db), getScorableJobs(db, jobIds)]);
  const only = opts.onlyUserIds ? new Set(opts.onlyUserIds) : null;
  const profiles = only ? allProfiles.filter((p) => only.has(p.userId)) : allProfiles;

  const pairs: Parameters<typeof bestMatchRows>[0] = [];
  for (const profile of profiles) {
    const enabled = new Set<string>(profile.sources ?? defaultSources(profile.remoteType));
    const eligible = jobs.filter((j) => j.sources.some((s) => enabled.has(s)));
    if (eligible.length === 0) continue;
    // Drop stale matches first, so a better-scoring profile of the same user can take the (user, job) slot.
    const stale = eligible.filter(({ job }) => scoreJob(profile, job) === null).map(({ jobId }) => jobId);
    if (stale.length > 0) await deleteNewMatches(db, profile.id, stale);
    for (const { jobId, job } of eligible) pairs.push({ profile, jobId, job });
  }
  return saveMatchRows(db, bestMatchRows(pairs));
}
