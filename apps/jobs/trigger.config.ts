import { config as loadEnv } from 'dotenv';
import { playwright } from '@trigger.dev/build/extensions/playwright';
import { defineConfig } from '@trigger.dev/sdk';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_set_TRIGGER_PROJECT_REF',
  dirs: ['./src/trigger'],
  maxDuration: 300,
  build: { extensions: [playwright({ browsers: ['chromium'], version: '1.63.0' })] },
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2 },
  },
});
