import 'server-only';
import { runs, tasks } from '@trigger.dev/sdk';

/** Asks the worker to rebuild queries and re-match recent jobs; hourly scheduling covers it otherwise. */
export async function requestProfileSync(profileId: string): Promise<void> {
  if (!process.env.TRIGGER_SECRET_KEY) return;
  try {
    await tasks.trigger('sync-profile', { profileId });
  } catch (err) {
    console.error('sync-profile trigger failed', err);
  }
}

/** "Find jobs now": scrape every query of the user's active profiles right away (rate-limited by the caller). */
export async function requestSearchNow(userId: string): Promise<boolean> {
  if (!process.env.TRIGGER_SECRET_KEY) return false;
  try {
    await tasks.trigger('search-now', { userId });
    return true;
  } catch (err) {
    console.error('search-now trigger failed', err);
    return false;
  }
}

export type ImportedJob = {
  jobId: string;
  sourceId: string;
  url: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  recruiter: string | null;
};

/**
 * Reads a DOU/Djinni/robota.ua vacancy by its link in the worker (the board parsers live there) and stores it as a
 * job; waits up to `timeoutMs` for the result. Null when the worker is not configured, the link is not a vacancy or
 * the run failed.
 */
export async function importJobByLink(url: string, timeoutMs = 40_000): Promise<ImportedJob | null> {
  if (!process.env.TRIGGER_SECRET_KEY) return null;
  try {
    const handle = await tasks.trigger('import-job', { url });
    const run = await Promise.race([
      runs.poll(handle, { pollIntervalMs: 1000 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return run && run.status === 'COMPLETED' ? ((run.output as ImportedJob | null) ?? null) : null;
  } catch (err) {
    console.error('import-job failed', err instanceof Error ? err.name : 'unknown');
    return null;
  }
}
