import { logger, task } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { prepareSearchNow } from '../pipeline/search-now';
import { pipelineDeps } from '../runtime';
import { enqueueScrapes } from './enqueue';

/** Started by the "Find jobs now" button (rate-limited in the DB by request_search_now). */
export const searchNowTask = task({
  id: 'search-now',
  machine: 'small-1x', // syncProfile bulk-loads recent jobs
  run: async (payload: { userId: string }) => {
    const deps = pipelineDeps();
    const { profiles, due } = await prepareSearchNow(getDb(), payload.userId, new Date(), {
      adapters: deps.adapters,
      env: deps.env ?? {},
      intervalMultiplier: deps.intervalMultiplier,
    });
    await enqueueScrapes(due);
    logger.info('search now', { userId: payload.userId, profiles, queries: due.length });
    return { profiles, queries: due.length };
  },
});
