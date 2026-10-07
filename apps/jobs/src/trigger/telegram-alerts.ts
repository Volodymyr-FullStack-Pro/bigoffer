import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { sendAlerts } from '../pipeline/telegram';
import { telegramDeps } from '../runtime';

export const telegramAlertsTask = schedules.task({
  id: 'telegram-alerts',
  queue: { concurrencyLimit: 1 },
  cron: '*/15 * * * *',
  run: async () => {
    const deps = telegramDeps();
    if (!deps) return { skipped: 'no token' };
    const result = await sendAlerts(getDb(), deps);
    logger.info('telegram alerts', result);
    return result;
  },
});
