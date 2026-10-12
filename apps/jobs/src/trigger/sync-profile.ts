import { logger, task } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { getProfile } from '../pipeline/repository';
import { dueNewQueries } from '../pipeline/search-now';
import { syncProfile } from '../pipeline/sync-profiles';
import { enqueueScrapes } from './enqueue';

export const syncProfileTask = task({
  id: 'sync-profile',
  machine: 'small-1x', // bulk-loads jobs/profiles; micro (0.25 GB) is too small
  run: async (payload: { profileId: string }) => {
    const db = getDb();
    const profile = await getProfile(db, payload.profileId);
    if (!profile) return { queryIds: 0, matched: 0 };
    const now = new Date();
    const result = await syncProfile(db, profile, now);
    // New keywords / boards from this save are scraped now, not at the next 30-minute tick.
    const fresh = await dueNewQueries(db, result.queryIds, now);
    await enqueueScrapes(fresh);
    logger.info('profile synced', { profileId: payload.profileId, matched: result.matched, queries: result.queryIds.length, scrapedNow: fresh.length });
    return { queryIds: result.queryIds.length, matched: result.matched, scrapedNow: fresh.length };
  },
});
