import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { discoverBoards } from '../pipeline/boards';
import { expireJobs, failStaleRuns } from '../pipeline/expire';
import { pipelineDeps } from '../runtime';

export const expireJobsTask = schedules.task({
  id: 'expire-jobs',
  cron: '0 3 * * *',
  run: async () => {
    const db = getDb();
    const now = new Date();
    const expired = await expireJobs(db, now);
    const timedOut = await failStaleRuns(db, now);
    const discovered = await discoverBoards(db, pipelineDeps());
    logger.info('expired jobs', { expired, timedOut, discovered });
    return { expired, timedOut, discovered };
  },
});
