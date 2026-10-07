import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { sendAlerts } from '../pipeline/telegram';
import { telegramDeps } from '../runtime';

export const telegramAlertsTask = schedules.task({
  id: 'telegram-alerts',
  queue: { concurrencyLimit: 1 },
  // A tick that waits behind a long run is dropped instead of piling up; the next tick catches up.
  ttl: '10m',
  // No retries: a retried run could send the same messages twice; the next tick picks up what is left.
  retry: { maxAttempts: 1 },
  cron: '*/15 * * * *',
  run: async () => {
    const deps = telegramDeps();
    if (!deps) return { skipped: 'no token' };
    const result = await sendAlerts(getDb(), deps);
    logger.info('telegram alerts', result);
    return result;
  },
});
