import { DEFAULT_USER_AGENT } from '@jp/scrapers';
import { z } from 'zod';

export function jobsEnv() {
  return z
    .object({
      SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
      SCRAPER_USER_AGENT: z.string().min(1).default(DEFAULT_USER_AGENT),
      JOOBLE_API_KEY: z.string().min(1).optional(),
      AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(900),
      AI_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(30),
      AI_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(4500),
    })
    .parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      SCRAPER_USER_AGENT: process.env.SCRAPER_USER_AGENT || undefined,
      JOOBLE_API_KEY: process.env.JOOBLE_API_KEY || undefined,
      AI_DAILY_LIMIT: process.env.AI_DAILY_LIMIT || undefined,
      AI_BATCH_SIZE: process.env.AI_BATCH_SIZE || undefined,
      AI_MIN_INTERVAL_MS: process.env.AI_MIN_INTERVAL_MS || undefined,
    });
}
