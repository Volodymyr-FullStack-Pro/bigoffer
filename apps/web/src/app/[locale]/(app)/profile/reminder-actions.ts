'use server';

import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : NaN);

/** Follow-up rules for the board: the first and second reminder (business days) and when a silence reads as ghosting (days). */
export async function saveReminderRules(rules: { first: number; second: number; ghost: number }): Promise<boolean> {
  const userId = await getUserId();
  const first = int(rules.first);
  const second = int(rules.second);
  const ghost = int(rules.ghost);
  if (!userId || !(first >= 2 && first <= 30) || !(second > first && second <= 45) || !(ghost >= 7 && ghost <= 90)) return false;
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ follow_up_days: [first, second], ghost_after_days: ghost }).eq('id', userId);
  if (error) return false;
  revalidatePath('/[locale]/board', 'page');
  return true;
}
