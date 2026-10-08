import { logger, task } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { getProfile } from '../pipeline/repository';
import { syncProfile } from '../pipeline/sync-profiles';

export const syncProfileTask = task({
  id: 'sync-profile',
  machine: 'small-1x', // bulk-loads jobs/profiles; micro (0.25 GB) is too small
  run: async (payload: { profileId: string }) => {
    const db = getDb();
    const profile = await getProfile(db, payload.profileId);
    if (!profile) return { queryIds: 0, matched: 0 };
    const result = await syncProfile(db, profile, new Date());
    logger.info('profile synced', { profileId: payload.profileId, ...result });
    return { queryIds: result.queryIds.length, matched: result.matched };
  },
});
