import { BROWSER_SOURCE_IDS, type SourceId } from '@jp/core';
import { idempotencyKeys, logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { getDueQueryIds } from '../pipeline/repository';
import { syncAllProfiles } from '../pipeline/sync-profiles';
import { scrapeQuery } from './scrape-query';

export const scheduleQueries = schedules.task({
  id: 'schedule-queries',
  cron: '5 * * * *',
  run: async () => {
    const db = getDb();
    const now = new Date();
    const profiles = await syncAllProfiles(db, now);
    const due = await getDueQueryIds(db, now);
    if (due.length > 0) {
      // One scrape per (query, scheduled slot): a query still waiting in its concurrency-1 queue keeps the same
      // next_run_at, so it is not enqueued twice; once it runs, next_run_at moves and the next slot gets a new key.
      const items = await Promise.all(
        due.map(async (q) => ({
          payload: { queryId: q.id, sourceId: q.sourceId as SourceId },
          options: {
            // TriggerOptions.queue is a queue NAME (string), not a queue object.
            queue: `scrape-${q.sourceId}`,
            idempotencyKey: await idempotencyKeys.create(`scrape:${q.id}:${q.nextRunAt}`, { scope: 'global' }),
            idempotencyKeyTTL: '6h',
            ...(BROWSER_SOURCE_IDS.has(q.sourceId as SourceId) ? { machine: 'small-2x' as const } : {}),
          },
        })),
      );
      await scrapeQuery.batchTrigger(items);
    }
    logger.info('scheduled', { profiles, queries: due.length });
    return { profiles, queries: due.length };
  },
});
