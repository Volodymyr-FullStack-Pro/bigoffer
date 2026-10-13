import { DEFAULT_USER_AGENT } from '@jp/scrapers';
import { z } from 'zod';

export function jobsEnv() {
  // Enrichment on a paid OpenRouter model has no free-tier quota or per-minute cap: larger batches, no pause.
  // With the free Gemini tier tried first (the default when both keys are set), requests keep to its ~15 per minute.
  const paidPublicAi = Boolean(process.env.OPENROUTER_API_KEY) && process.env.AI_MODEL_PUBLIC_OPENROUTER !== 'off';
  const freeFirst = paidPublicAi && Boolean(process.env.GEMINI_API_KEY_PUBLIC) && process.env.AI_PUBLIC_FREE_FIRST !== 'off';
  return z
    .object({
      SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
      SCRAPER_USER_AGENT: z.string().min(1).default(DEFAULT_USER_AGENT),
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
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || undefined,
      SITE_URL: process.env.SITE_URL || undefined,
      AI_DAILY_LIMIT: process.env.AI_DAILY_LIMIT || (paidPublicAi ? 3000 : undefined),
      AI_BATCH_SIZE: process.env.AI_BATCH_SIZE || (freeFirst ? 30 : paidPublicAi ? 60 : undefined),
      AI_MIN_INTERVAL_MS: process.env.AI_MIN_INTERVAL_MS || (freeFirst ? 4000 : paidPublicAi ? 300 : undefined),
    });
}
