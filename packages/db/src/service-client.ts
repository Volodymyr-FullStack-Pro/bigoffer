import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Bypasses RLS. Server-side workers and tests only — never import from client code. */
export function createServiceClient(url: string, secretKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
