import { config as loadEnv } from 'dotenv';
import { defineConfig } from '@trigger.dev/sdk';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_set_TRIGGER_PROJECT_REF',
  dirs: ['./src/trigger'],
  runtime: 'node-24',
  maxDuration: 300,
  // Cheapest preset for everything; heavier tasks set their own machine.
  machine: 'micro',
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2 },
  },
});
