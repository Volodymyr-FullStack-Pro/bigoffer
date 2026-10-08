import type { Database } from '@jp/db';
import { createServiceClient } from '@jp/db/service';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jobsEnv } from './env';

export type Db = SupabaseClient<Database>;

let client: Db | undefined;

export function getDb(): Db {
  if (!client) {
    const env = jobsEnv();
    client = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  }
  return client;
}
