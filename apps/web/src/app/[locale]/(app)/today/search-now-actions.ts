'use server';

import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { requestProfileSync, requestSearchNow } from '@/lib/trigger';

export type SearchNowStatus = { requestedAt: string | null; total: number; done: number; newMatches: number };

export async function getSearchNowStatus(): Promise<SearchNowStatus | null> {
  if (!(await getUserId())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_now_status');
  const row = data?.[0];
  if (error || !row) return null;
  return { requestedAt: row.requested_at, total: row.total, done: row.done, newMatches: row.new_matches };
}

/** Starts an immediate search; at most once per 30 minutes (enforced by request_search_now in the DB). */
export async function startSearchNow(): Promise<{ ok: true } | { ok: false; error: 'cooldown' | 'failed' }> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: 'failed' };
  const supabase = await createClient();
  const { data: requestedAt, error } = await supabase.rpc('request_search_now');
  if (error) return { ok: false, error: 'failed' };
  if (!requestedAt) return { ok: false, error: 'cooldown' };
  return (await requestSearchNow(userId)) ? { ok: true } : { ok: false, error: 'failed' };
}

/** Autopilot = the user's search profiles are active (scraped on schedule) or paused. */
export async function setAutopilot(on: boolean): Promise<boolean> {
  if (typeof on !== 'boolean' || !(await getUserId())) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('search_profiles').update({ is_active: on }).neq('is_active', on).select('id');
  if (error) return false;
  for (const p of data ?? []) await requestProfileSync(p.id);
  revalidatePath('/[locale]/today', 'page');
  revalidatePath('/[locale]/search', 'page');
  return true;
}
