import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { checkLiveness } from '../pipeline/liveness';
import { pipelineDeps } from '../runtime';

/** Every 2 hours: closed DOU / Djinni / robota.ua vacancies leave users' feeds. */
export const checkLivenessTask = schedules.task({
  id: 'check-liveness',
  machine: 'micro',
  cron: '25 */2 * * *',
  maxDuration: 300,
  run: async () => {
    const deps = pipelineDeps();
    const result = await checkLiveness(getDb(), { adapters: deps.adapters, createContext: deps.createContext });
    logger.info('liveness', result);
    return result;
  },
});
