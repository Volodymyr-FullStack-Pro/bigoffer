import { SOURCE_IDS, type SourceId } from '@jp/core';
import { queue } from '@trigger.dev/sdk';

/** Default for scrape-query runs triggered without an explicit queue (e.g. from the dashboard). */
export const SCRAPE_DEFAULT_QUEUE = queue({ name: 'scrape-default', concurrencyLimit: 1 });

/** One queue per source so we never hit a site with parallel requests. */
export const SOURCE_QUEUES = Object.fromEntries(
  SOURCE_IDS.map((id) => [id, queue({ name: `scrape-${id}`, concurrencyLimit: 1 })]),
) as Record<SourceId, ReturnType<typeof queue>>;

/** All free-tier AI work shares one lane: the per-minute quota is per key, not per task. */
export const AI_PUBLIC_QUEUE = queue({ name: 'ai-public', concurrencyLimit: 1 });
