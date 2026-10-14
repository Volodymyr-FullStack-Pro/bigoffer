import { logger, task } from '@trigger.dev/sdk';
import { importJob } from '../pipeline/import-job';
import { pipelineDeps } from '../runtime';

/** "Add card" with a DOU/Djinni/robota.ua link: the web app waits for this run and creates the card from it. */
export const importJobTask = task({
  id: 'import-job',
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  run: async (payload: { url: string }) => {
    const deps = pipelineDeps();
    const ctx = deps.createContext('import');
    try {
      const job = await importJob(deps.db, ctx, payload.url, new Date());
      logger.info('import job', { found: job !== null, sourceId: job?.sourceId });
      return job;
    } finally {
      await ctx.dispose?.();
    }
  },
});
