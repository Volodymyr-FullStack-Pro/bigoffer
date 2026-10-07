import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

// Override with E2E_PORT when 3000 is taken by another local app.
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Dev server in CI too: the fake-AI guard in @jp/ai refuses to run in a production build.
    // The production build is verified separately in the CI checks job.
    command: `pnpm dev --port ${port}`,
    url: `${baseURL}/en/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // No TELEGRAM_BOT_TOKEN: the bot client is a no-op, so the webhook can be tested without Telegram.
    env: {
      AI_PROVIDER: 'fake',
      ALLOW_FAKE_AI: '1',
      TELEGRAM_WEBHOOK_SECRET: 'e2e-secret',
      NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: 'bigoffer_test_bot',
      TELEGRAM_BOT_TOKEN: '',
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? '',
    },
  },
});
