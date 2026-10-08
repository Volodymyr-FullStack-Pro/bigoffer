import { logger, schedules } from '@trigger.dev/sdk';
import { type AiStatus, enrichJobs } from '../pipeline/enrich';
import { explainTopMatches } from '../pipeline/explain';
import { aiDeps } from '../runtime';
import { AI_PUBLIC_QUEUE } from './queues';

/** Quota trouble is expected on the free tier; a provider error usually means broken configuration. */
function log(message: string, result: { status: AiStatus } & Record<string, unknown>): void {
  if (result.status === 'provider_error') logger.error(message, result);
  else if (result.status === 'rate_limited' || result.status === 'daily_limit') logger.warn(message, result);
  else logger.info(message, result);
}

export const enrichJobsTask = schedules.task({
  id: 'enrich-jobs',
  cron: '*/15 * * * *',
  queue: AI_PUBLIC_QUEUE,
  // A tick that waits behind a long run is dropped instead of piling up.
  ttl: '10m',
  maxDuration: 300,
  retry: { maxAttempts: 1, outOfMemory: { machine: 'small-1x' } },
  run: async () => {
    const result = await enrichJobs(aiDeps());
    if (result.status === 'unavailable') logger.warn('GEMINI_API_KEY_PUBLIC is not set; enrichment skipped');
    else log('enrichment', result);
    return result;
  },
});

export const explainMatchesTask = schedules.task({
  id: 'explain-matches',
  cron: '40 * * * *',
  queue: AI_PUBLIC_QUEUE,
  ttl: '30m',
  maxDuration: 300,
  retry: { maxAttempts: 1, outOfMemory: { machine: 'small-1x' } },
  run: async () => {
    const result = await explainTopMatches(aiDeps());
    log('explanations', result);
    return result;
  },
});
