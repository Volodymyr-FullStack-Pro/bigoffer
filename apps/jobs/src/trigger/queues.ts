import { SOURCE_IDS, type SourceId } from '@jp/core';
import { queue } from '@trigger.dev/sdk';

/** One queue per source so we never hit a site with parallel requests. */
export const SOURCE_QUEUES = Object.fromEntries(
  SOURCE_IDS.map((id) => [id, queue({ name: `scrape-${id}`, concurrencyLimit: 1 })]),
) as Record<SourceId, ReturnType<typeof queue>>;
