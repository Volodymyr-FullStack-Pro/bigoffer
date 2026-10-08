import 'server-only';
import type { Database } from '@jp/db';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/env';

/** Service-role client: bypasses RLS. Only the Telegram webhook uses it, always scoped to the user resolved from the chat. */
export function createAdminSupabase() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not set');
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}
