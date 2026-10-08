'use server';

import { rankAtTop } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SaveResult = { ok: true; applicationId: string; created: boolean } | { ok: false };

export async function saveMatch(matchId: string, target: 'saved' | 'applied'): Promise<SaveResult> {
  if (!UUID.test(matchId) || (target !== 'saved' && target !== 'applied') || !(await getUserId())) return { ok: false };
  const supabase = await createClient();
  const { data: column } = await supabase.from('board_columns').select('id').eq('key', target).maybeSingle();
  if (!column) return { ok: false };
  const { data: first } = await supabase
    .from('applications')
    .select('rank')
    .eq('column_id', column.id)
    .order('rank')
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase.rpc('save_match_to_board', {
    p_match_id: matchId,
    p_column_key: target,
    p_rank: rankAtTop(first?.rank ?? null),
  });
  const row = data?.[0];
  if (error || !row) {
    if (error) console.error('saveMatch failed', error.message);
    return { ok: false };
  }
  revalidatePath('/[locale]/board', 'page');
  return { ok: true, applicationId: row.application_id, created: row.created };
}

export async function hideMatch(matchId: string): Promise<boolean> {
  if (!UUID.test(matchId) || !(await getUserId())) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('job_matches').update({ state: 'hidden' }).eq('id', matchId).select('id');
  if (error) console.error('hideMatch failed', error.message);
  return !error && (data?.length ?? 0) > 0;
}

export async function restoreMatch(matchId: string, applicationId: string | null): Promise<boolean> {
  if (!UUID.test(matchId) || (applicationId !== null && !UUID.test(applicationId)) || !(await getUserId())) return false;
  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_match', {
    p_match_id: matchId,
    ...(applicationId ? { p_application_id: applicationId } : {}),
  });
  if (error) console.error('restoreMatch failed', error.message);
  revalidatePath('/[locale]/board', 'page');
  return !error;
}
