import { BROWSER_SOURCE_IDS, type SourceId } from '@jp/core';
import { idempotencyKeys } from '@trigger.dev/sdk';
import { scrapeQuery } from './scrape-query';

/**
 * One scrape per (query, scheduled slot), on the source's own queue: a query still waiting in its concurrency-1
 * queue keeps the same next_run_at, so it is not enqueued twice; once it runs, next_run_at moves and the next slot
 * gets a new key.
 */
export async function enqueueScrapes(due: { id: string; sourceId: string; nextRunAt: string }[]): Promise<void> {
  if (due.length === 0) return;
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
