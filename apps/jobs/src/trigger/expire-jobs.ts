import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { expireJobs, failStaleRuns } from '../pipeline/expire';

export const expireJobsTask = schedules.task({
  id: 'expire-jobs',
  cron: '0 3 * * *',
  run: async () => {
    const db = getDb();
    const now = new Date();
    const expired = await expireJobs(db, now);
    const timedOut = await failStaleRuns(db, now);
    logger.info('expired jobs', { expired, timedOut });
    return { expired, timedOut };
  },
});
