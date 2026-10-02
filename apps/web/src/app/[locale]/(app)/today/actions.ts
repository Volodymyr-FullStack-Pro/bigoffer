'use server';

import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const ALLOWED = new Set(['hidden', 'seen']);

export async function setMatchState(formData: FormData): Promise<void> {
  const matchId = String(formData.get('matchId') ?? '');
  const state = String(formData.get('state') ?? '');
  if (!matchId || !ALLOWED.has(state) || !(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from('job_matches').update({ state }).eq('id', matchId);
  revalidatePath('/[locale]/today', 'page');
}
