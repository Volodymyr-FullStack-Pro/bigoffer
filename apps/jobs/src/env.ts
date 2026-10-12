import { DEFAULT_USER_AGENT } from '@jp/scrapers';
import { z } from 'zod';

/** Scales scrape intervals to fit the Trigger.dev credit: a number >= 1; anything smaller or invalid means 1. */
export function scrapeIntervalMultiplier(env: { SCRAPE_INTERVAL_MULTIPLIER?: string | undefined } = process.env): number {
  const n = Number(env.SCRAPE_INTERVAL_MULTIPLIER);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function jobsEnv() {
  // Enrichment on a paid OpenRouter model has no free-tier quota or per-minute cap: larger batches, no pause.
  const paidPublicAi = Boolean(process.env.OPENROUTER_API_KEY) && process.env.AI_MODEL_PUBLIC_OPENROUTER !== 'off';
  return z
    .object({
      SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
      SCRAPER_USER_AGENT: z.string().min(1).default(DEFAULT_USER_AGENT),
      JOOBLE_API_KEY: z.string().min(1).optional(),
      SCRAPE_INTERVAL_MULTIPLIER: z.number().min(1),
      TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
      SITE_URL: z.url().optional(),
      AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(900),
      AI_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(30),
      AI_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(4500),
    })
    .parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      SCRAPER_USER_AGENT: process.env.SCRAPER_USER_AGENT || undefined,
      JOOBLE_API_KEY: process.env.JOOBLE_API_KEY || undefined,
      SCRAPE_INTERVAL_MULTIPLIER: scrapeIntervalMultiplier(),
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || undefined,
      SITE_URL: process.env.SITE_URL || undefined,
      AI_DAILY_LIMIT: process.env.AI_DAILY_LIMIT || (paidPublicAi ? 3000 : undefined),
      AI_BATCH_SIZE: process.env.AI_BATCH_SIZE || (paidPublicAi ? 60 : undefined),
      AI_MIN_INTERVAL_MS: process.env.AI_MIN_INTERVAL_MS || (paidPublicAi ? 300 : undefined),
    });
}
