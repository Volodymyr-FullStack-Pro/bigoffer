import { DEFAULT_USER_AGENT } from '@jp/scrapers';
import { z } from 'zod';

export function jobsEnv() {
  return z
    .object({
      SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
      SCRAPER_USER_AGENT: z.string().min(1).default(DEFAULT_USER_AGENT),
      JOOBLE_API_KEY: z.string().min(1).optional(),
    })
    .parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      SCRAPER_USER_AGENT: process.env.SCRAPER_USER_AGENT || undefined,
      JOOBLE_API_KEY: process.env.JOOBLE_API_KEY || undefined,
    });
}
