import { createBotApi } from '@jp/core';
import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { jobsEnv } from '../env';
import { auditRecentEnrichment } from '../pipeline/audit';
import { aiDeps } from '../runtime';
import { AI_PUBLIC_QUEUE } from './queues';

/** Daily: 10 random cards from the last day re-checked against their postings by the public model. */
export const auditEnrichmentTask = schedules.task({
  id: 'audit-enrichment',
  cron: '15 6 * * *',
  queue: AI_PUBLIC_QUEUE,
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async () => {
    const env = jobsEnv();
    const result = await auditRecentEnrichment(getDb(), {
      llm: aiDeps().llm,
      now: new Date(),
      bot: env.TELEGRAM_BOT_TOKEN ? createBotApi(env.TELEGRAM_BOT_TOKEN) : null,
      ownerChatId: env.OWNER_TELEGRAM_CHAT_ID ?? null,
    });
    logger.info('enrichment audit', { ...result });
    if (result.hardJobs >= 3) throw new Error(`AI audit: ${result.hardJobs} of ${result.checked} cards have wrong format, salary or job flag`);
    return { checked: result.checked, findings: result.findings.length, hardJobs: result.hardJobs };
  },
});
