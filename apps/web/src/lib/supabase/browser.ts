import type { Database } from '@jp/db';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/env';

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
