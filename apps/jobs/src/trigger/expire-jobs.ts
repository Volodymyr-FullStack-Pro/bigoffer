import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { expireJobs, failStaleRuns, purgeExpiredJobs } from '../pipeline/expire';

export const expireJobsTask = schedules.task({
  id: 'expire-jobs',
  machine: 'small-1x', // bulk-loads jobs/profiles; micro (0.25 GB) is too small
  cron: '0 3 * * *',
  run: async () => {
    const db = getDb();
    const now = new Date();
    const expired = await expireJobs(db, now);
    const timedOut = await failStaleRuns(db, now);
    const purged = await purgeExpiredJobs(db, now);
    logger.info('expired jobs', { expired, purged, timedOut });
    return { expired, purged, timedOut };
  },
});
