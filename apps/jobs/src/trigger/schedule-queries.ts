import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { failStaleRuns } from '../pipeline/expire';
import { deferUnconfigured } from '../pipeline/schedule';
import { getDueQueryIds } from '../pipeline/repository';
import { syncAllProfiles } from '../pipeline/sync-profiles';
import { pipelineDeps } from '../runtime';
import { enqueueScrapes } from './enqueue';

export const scheduleQueries = schedules.task({
  id: 'schedule-queries',
  machine: 'small-1x', // bulk-loads jobs/profiles; micro (0.25 GB) is too small
  cron: '5 * * * *',
  run: async () => {
    const db = getDb();
    const now = new Date();
    // A scrape that hit maxDuration (300 s × 3 attempts) leaves its run 'running'; close it within the hour.
    const timedOut = await failStaleRuns(db, now, 30);
    const profiles = await syncAllProfiles(db, now);
    const deps = pipelineDeps();
    const dueAll = await getDueQueryIds(db, now);
    // Unconfigured sources (no API key) are deferred in bulk instead of triggering empty runs.
    const due = await deferUnconfigured(db, dueAll, deps.adapters, deps.env ?? {}, now, deps.intervalMultiplier);
    await enqueueScrapes(due);
    logger.info('scheduled', { profiles, queries: due.length, timedOut });
    return { profiles, queries: due.length, timedOut };
  },
});
