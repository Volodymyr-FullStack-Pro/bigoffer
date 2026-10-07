import { type ScorableJob, type SearchProfile, scoreJob } from '@jp/core';
import type { Json } from '@jp/db';
import type { Db } from '../db';
import { insertMatches, type MatchRow } from './repository';

/** Scores each (profile, job) pair and keeps the best-scoring profile per (user, job). */
export function bestMatchRows(pairs: { profile: SearchProfile; jobId: string; job: ScorableJob }[]): MatchRow[] {
  const best = new Map<string, MatchRow>();
  for (const { profile, jobId, job } of pairs) {
    const result = scoreJob(profile, job);
    if (!result) continue;
    const key = `${profile.userId}:${jobId}`;
    const prev = best.get(key);
    if (prev && prev.score >= result.score) continue;
    best.set(key, {
      user_id: profile.userId,
      job_id: jobId,
      search_profile_id: profile.id,
      score: result.score,
      breakdown: result.breakdown as unknown as NonNullable<Json>,
      state: result.hidden ? 'hidden' : 'new',
    });
  }
  return [...best.values()];
}

/** Upserts the rows and returns how many are visible ('new'). */
export async function saveMatchRows(db: Db, rows: MatchRow[]): Promise<number> {
  await insertMatches(db, rows);
  return rows.filter((r) => r.state === 'new').length;
}

export async function matchJobs(
  db: Db,
  profiles: SearchProfile[],
  jobs: { jobId: string; job: ScorableJob }[],
): Promise<number> {
  return saveMatchRows(db, bestMatchRows(profiles.flatMap((profile) => jobs.map(({ jobId, job }) => ({ profile, jobId, job })))));
}
