import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { expireJobs } from '../pipeline/expire';

export const expireJobsTask = schedules.task({
  id: 'expire-jobs',
  cron: '0 3 * * *',
  run: async () => {
    const expired = await expireJobs(getDb(), new Date());
    logger.info('expired jobs', { expired });
    return { expired };
  },
});
