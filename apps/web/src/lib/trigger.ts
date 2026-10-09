import 'server-only';
import { tasks } from '@trigger.dev/sdk';

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
