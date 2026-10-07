import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { discoverBoards } from '../pipeline/boards';
import { expireJobs, failStaleRuns } from '../pipeline/expire';
import { pipelineDeps } from '../runtime';

export const expireJobsTask = schedules.task({
  id: 'expire-jobs',
  machine: 'small-1x', // bulk-loads jobs/profiles; micro (0.25 GB) is too small
  cron: '0 3 * * *',
  run: async () => {
    const db = getDb();
    const now = new Date();
    const expired = await expireJobs(db, now);
    const timedOut = await failStaleRuns(db, now);
    let discovered: { checked: number; added: number } | null = null;
    try {
      discovered = await discoverBoards(db, pipelineDeps());
    } catch (err) {
      logger.error('board discovery failed', { error: err instanceof Error ? err.message : String(err) });
    }
    logger.info('expired jobs', { expired, timedOut, discovered });
    return { expired, timedOut, discovered };
  },
});
