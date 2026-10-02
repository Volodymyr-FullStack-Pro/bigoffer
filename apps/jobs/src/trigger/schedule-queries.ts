import type { SourceId } from '@jp/core';
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
      // One scrape per (query, UTC hour): a query still waiting in its concurrency-1 queue is not enqueued twice.
      const hourStamp = now.toISOString().slice(0, 13);
      const items = await Promise.all(
        due.map(async (q) => ({
          payload: { queryId: q.id, sourceId: q.sourceId as SourceId },
          options: {
            // TriggerOptions.queue is a queue NAME (string), not a queue object.
            queue: `scrape-${q.sourceId}`,
            idempotencyKey: await idempotencyKeys.create(`scrape:${q.id}:${hourStamp}`, { scope: 'global' }),
            idempotencyKeyTTL: '1h',
          },
        })),
      );
      await scrapeQuery.batchTrigger(items);
    }
    logger.info('scheduled', { profiles, queries: due.length });
    return { profiles, queries: due.length };
  },
});
