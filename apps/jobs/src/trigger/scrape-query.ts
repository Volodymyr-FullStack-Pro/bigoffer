import type { SourceId } from '@jp/core';
import { logger, task } from '@trigger.dev/sdk';
import { runQuery } from '../pipeline/run-query';
import { pipelineDeps } from '../runtime';

export const scrapeQuery = task({
  id: 'scrape-query',
  maxDuration: 300,
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2 },
  run: async (payload: { queryId: string; sourceId: SourceId }) => {
    const result = await runQuery(pipelineDeps(), payload.queryId);
    if (result.alert) logger.error(result.alert, { sourceId: payload.sourceId });
    logger.info('query done', { ...payload, ...result });
    return result;
  },
});
