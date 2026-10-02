import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: '.env.local' });

export default defineConfig({
  test: { include: ['test/**/*.int.test.ts'], fileParallelism: false, testTimeout: 30_000 },
});
