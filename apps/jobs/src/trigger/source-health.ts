import { createBotApi } from '@jp/core';
import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { jobsEnv } from '../env';
import { checkHealth } from '../pipeline/health';

/** Hourly: each board still runs, finds jobs and fills their fields; AI enrichment keeps up. A problem fails the run. */
export const sourceHealthTask = schedules.task({
  id: 'source-health',
  // micro (0.25 GB) was OOM-killed once while reading a day of runs and jobs; a run takes seconds, so the cost is nil.
  machine: 'small-1x',
  cron: '50 * * * *',
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async () => {
    const env = jobsEnv();
    const result = await checkHealth(getDb(), {
      now: new Date(),
      bot: env.TELEGRAM_BOT_TOKEN ? createBotApi(env.TELEGRAM_BOT_TOKEN) : null,
      ownerChatId: env.OWNER_TELEGRAM_CHAT_ID ?? null,
    });
    logger.info('source health', { rows: result.rows, enrichBacklog: result.enrichBacklog, alerted: result.alerted });
    if (result.issues.length > 0) {
      throw new Error(`Health problems: ${result.issues.map((i) => i.text).join('; ')}`);
    }
    return { ok: true };
  },
});
