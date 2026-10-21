import { logger, task } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { redetectFormat } from '../pipeline/redetect-format';

/** One-off, run by hand after a fix to format detection: re-reads the format of stored remote jobs. */
export const redetectFormatTask = task({
  id: 'redetect-format',
  machine: 'small-1x', // bulk-loads jobs/profiles; micro (0.25 GB) is too small
  run: async () => {
    const result = await redetectFormat(getDb());
    logger.info('redetected job formats', result);
    return result;
  },
});
