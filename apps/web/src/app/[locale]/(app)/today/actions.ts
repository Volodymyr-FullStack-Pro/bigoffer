'use server';

import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = new Set(['hidden', 'seen']);

export async function setMatchState(formData: FormData): Promise<void> {
  const matchId = String(formData.get('matchId') ?? '');
  const state = String(formData.get('state') ?? '');
  if (!UUID.test(matchId) || !ALLOWED.has(state) || !(await getUserId())) return;
  const supabase = await createClient();
  const { error } = await supabase.from('job_matches').update({ state }).eq('id', matchId);
  if (error) console.error('setMatchState failed', error.message);
  revalidatePath('/[locale]/today', 'page');
}
