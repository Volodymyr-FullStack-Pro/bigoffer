import type { SourceId } from '@jp/core';
import { idempotencyKeys, logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { jobsEnv } from '../env';
import { radarSweep } from '../pipeline/radar';
import { scrapeQuery } from './scrape-query';

/**
 * Every two minutes: read the Djinni and DOU feeds of the active searches; a posting we have not seen makes its query
 * scrape now (marked urgent, so the new job is enriched right after and the alert goes out on the next tick).
 */
export const radarTask = schedules.task({
  id: 'radar',
  cron: '*/2 * * * *',
  machine: 'micro',
  queue: { concurrencyLimit: 1 },
  // A sweep that waits behind a slow one is dropped; the next tick reads the feeds anyway.
  ttl: '2m',
  maxDuration: 90,
  retry: { maxAttempts: 1 },
  run: async () => {
    const userAgent = jobsEnv().SCRAPER_USER_AGENT;
    const fetchText = async (url: string) => {
      const res = await fetch(url, { headers: { 'user-agent': userAgent, accept: 'application/rss+xml, text/xml' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    };
    const result = await radarSweep(getDb(), fetchText);
    if (result.hits.length > 0) {
      const items = await Promise.all(
        result.hits.map(async (h) => ({
          payload: { queryId: h.queryId, sourceId: h.sourceId as SourceId, urgent: true },
          options: {
            queue: `scrape-${h.sourceId}`,
            // The same new postings trigger one scrape, however many sweeps see them before it runs.
            idempotencyKey: await idempotencyKeys.create(`radar:${h.queryId}:${[...h.fresh].sort().join(',')}`, { scope: 'global' }),
            idempotencyKeyTTL: '6h',
          },
        })),
      );
      await scrapeQuery.batchTrigger(items);
    }
    logger.info('radar', { checked: result.checked, errors: result.errors, hits: result.hits.length, fresh: result.hits.reduce((n, h) => n + h.fresh.length, 0) });
    return { checked: result.checked, errors: result.errors, hits: result.hits.length };
  },
});
