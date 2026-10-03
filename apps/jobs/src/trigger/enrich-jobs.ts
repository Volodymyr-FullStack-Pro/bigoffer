import { logger, schedules } from '@trigger.dev/sdk';
import { enrichJobs } from '../pipeline/enrich';
import { aiDeps } from '../runtime';
import { AI_PUBLIC_QUEUE } from './queues';

export const enrichJobsTask = schedules.task({
  id: 'enrich-jobs',
  cron: '*/15 * * * *',
  queue: AI_PUBLIC_QUEUE,
  // A tick that waits behind a long run is dropped instead of piling up.
  ttl: '10m',
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async () => {
    const result = await enrichJobs(aiDeps());
    if (result.status === 'unavailable') logger.warn('GEMINI_API_KEY_PUBLIC is not set; enrichment skipped');
    else logger.info('enrichment', result);
    return result;
  },
});
