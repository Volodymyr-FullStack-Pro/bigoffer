import { createLlmClient, readAiEnv } from '@jp/ai';
import { BROWSER_SOURCE_IDS, createBotApi, type SourceId } from '@jp/core';
import { ADAPTERS, createHttpContext, createPlaywrightRenderer } from '@jp/scrapers';
import { getDb } from './db';
import { jobsEnv } from './env';
import type { AiDeps } from './pipeline/enrich';
import type { TelegramDeps } from './pipeline/telegram';
import type { RunQueryDeps } from './pipeline/run-query';

export function pipelineDeps(): RunQueryDeps {
  const env = jobsEnv();
  const adapterEnv = {
    JOOBLE_API_KEY: env.JOOBLE_API_KEY,
    ADZUNA_APP_ID: env.ADZUNA_APP_ID,
    ADZUNA_APP_KEY: env.ADZUNA_APP_KEY,
  };
  return {
    db: getDb(),
    adapters: ADAPTERS,
    env: adapterEnv,
    intervalMultiplier: env.SCRAPE_INTERVAL_MULTIPLIER,
    createContext: (sourceId) =>
      createHttpContext(
        { userAgent: env.SCRAPER_USER_AGENT },
        adapterEnv,
        BROWSER_SOURCE_IDS.has(sourceId as SourceId)
          ? () => createPlaywrightRenderer({ userAgent: env.SCRAPER_USER_AGENT })
          : undefined,
      ),
  };
}

export function aiDeps(): AiDeps & { batchSize: number } {
  const env = jobsEnv();
  return {
    db: getDb(),
    llm: createLlmClient(readAiEnv()),
    dailyLimit: env.AI_DAILY_LIMIT,
    batchSize: env.AI_BATCH_SIZE,
    minIntervalMs: env.AI_MIN_INTERVAL_MS,
  };
}

/** Telegram deps, or null when TELEGRAM_BOT_TOKEN is not set (the tasks then skip). SITE_URL is required with a token. */
export function telegramDeps(now: Date = new Date()): TelegramDeps | null {
  const env = jobsEnv();
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  if (!env.SITE_URL) throw new Error('SITE_URL is required when TELEGRAM_BOT_TOKEN is set');
  return { bot: createBotApi(env.TELEGRAM_BOT_TOKEN), siteUrl: env.SITE_URL, now };
}
