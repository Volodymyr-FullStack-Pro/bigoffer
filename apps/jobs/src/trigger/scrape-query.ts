import type { SourceId } from '@jp/core';
import { logger, task } from '@trigger.dev/sdk';
import { runQuery } from '../pipeline/run-query';
import { pipelineDeps } from '../runtime';
import { SCRAPE_DEFAULT_QUEUE } from './queues';

export const scrapeQuery = task({
  id: 'scrape-query',
  maxDuration: 300,
  // The scheduler routes each run to its per-source queue; anything else is bounded by this one.
  queue: SCRAPE_DEFAULT_QUEUE,
  // Browser sources start on small-2x, so an out-of-memory retry must not downgrade them.
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2, outOfMemory: { machine: 'small-2x' } },
  run: async (payload: { queryId: string; sourceId: SourceId }) => {
    const result = await runQuery(pipelineDeps(), payload.queryId);
    if (result.alert) logger.error(result.alert, { sourceId: payload.sourceId });
    logger.info('query done', { ...payload, ...result });
    return result;
  },
});
