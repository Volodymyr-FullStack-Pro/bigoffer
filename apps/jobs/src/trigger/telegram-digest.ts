import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { sendDigests } from '../pipeline/telegram';
import { telegramDeps } from '../runtime';

export const telegramDigestTask = schedules.task({
  id: 'telegram-digest',
  queue: { concurrencyLimit: 1 },
  // A tick that waits behind a long run is dropped instead of piling up; the next tick catches up.
  ttl: '30m',
  // No retries: a retried run could send the same messages twice; the next tick picks up what is left.
  retry: { maxAttempts: 1 },
  cron: '5 * * * *',
  run: async () => {
    const deps = telegramDeps();
    if (!deps) return { skipped: 'no token' };
    const result = await sendDigests(getDb(), deps);
    logger.info('telegram digest', result);
    return result;
  },
});
