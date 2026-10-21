import type { SourceId } from '@jp/core';
import { logger, task } from '@trigger.dev/sdk';
import { enrichJobs } from '../pipeline/enrich';
import { runQuery } from '../pipeline/run-query';
import { aiDeps, pipelineDeps } from '../runtime';
import { SCRAPE_DEFAULT_QUEUE } from './queues';

export const scrapeQuery = task({
  id: 'scrape-query',
  maxDuration: 300,
  // The scheduler routes each run to its per-source queue; anything else is bounded by this one.
  queue: SCRAPE_DEFAULT_QUEUE,
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2, outOfMemory: { machine: 'small-1x' } },
  run: async (payload: { queryId: string; sourceId: SourceId; urgent?: boolean }) => {
    const result = await runQuery(pipelineDeps(), payload.queryId, { force: payload.urgent === true });
    if (result.alert) logger.error(result.alert, { sourceId: payload.sourceId });
    logger.info('query done', { ...payload, ...result });
    // A radar hit: enrich the new jobs now (the alert waits for it) instead of at the next 15-minute batch.
    if (payload.urgent && result.status === 'ok' && result.inserted > 0) {
      const enriched = await enrichJobs({ ...aiDeps(), timeBudgetMs: 90_000 }).catch((e: unknown) => ({ status: 'error', error: String(e) }));
      logger.info('urgent enrichment', enriched);
    }
    return result;
  },
});
