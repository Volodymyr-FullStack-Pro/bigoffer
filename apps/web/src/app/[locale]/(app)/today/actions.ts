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

/** A hidden job's apply kit is dead weight — unless the job is on the board, where the kit is still used. */
async function dropKitUnlessOnBoard(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string): Promise<void> {
  const { data: app } = await supabase.from('applications').select('id').eq('job_id', jobId).limit(1).maybeSingle();
  if (app) return;
  const { error } = await supabase.from('apply_kits').delete().eq('job_id', jobId);
  if (error) console.error('drop kit failed', error.message);
}

export async function hideMatch(matchId: string): Promise<boolean> {
  if (!UUID.test(matchId) || !(await getUserId())) return false;
  const supabase = await createClient();
  // A manual hide is final: hide_match also drops the rule mark so a later rescore never brings it back.
  const { data: jobId, error } = await supabase.rpc('hide_match', { p_match_id: matchId });
  if (error) console.error('hideMatch failed', error.message);
  if (jobId) await dropKitUnlessOnBoard(supabase, jobId);
  return !error && Boolean(jobId);
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

/** A job's full description, loaded when its detail opens (the feed itself ships without them). */
export async function getJobDescription(jobId: string): Promise<string | null> {
  if (!UUID.test(jobId) || !(await getUserId())) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('jobs').select('description_text').eq('id', jobId).maybeSingle();
  return data?.description_text?.slice(0, 8000) ?? null;
}
