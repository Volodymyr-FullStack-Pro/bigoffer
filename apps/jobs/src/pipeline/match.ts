import { type ScorableJob, type SearchProfile, scoreJob } from '@jp/core';
import type { Json } from '@jp/db';
import type { Db } from '../db';
import { insertMatches, type MatchRow } from './repository';

export async function matchJobs(
  db: Db,
  profiles: SearchProfile[],
  jobs: { jobId: string; job: ScorableJob }[],
): Promise<number> {
  const best = new Map<string, MatchRow>();
  for (const profile of profiles) {
    for (const { jobId, job } of jobs) {
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
  }
  const rows = [...best.values()];
  await insertMatches(db, rows);
  return rows.filter((r) => r.state === 'new').length;
}
