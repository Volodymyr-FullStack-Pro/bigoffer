'use server';

import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { mergeUiPrefs, parseUiPrefs, uiPrefsSchema, type UiPrefs } from './ui-prefs';

/** Saves a partial change of the user's UI prefs (merged into what is stored). */
export async function saveUiPrefs(patch: UiPrefs): Promise<boolean> {
  const parsed = uiPrefsSchema.safeParse(patch);
  const userId = await getUserId();
  if (!parsed.success || !userId) return false;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('ui_prefs').eq('id', userId).single();
  const next = mergeUiPrefs(parseUiPrefs(data?.ui_prefs), parsed.data);
  const { error } = await supabase.from('profiles').update({ ui_prefs: next }).eq('id', userId);
  return !error;
}

export async function loadUiPrefs(): Promise<UiPrefs> {
  const userId = await getUserId();
  if (!userId) return {};
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('ui_prefs').eq('id', userId).single();
  return parseUiPrefs(data?.ui_prefs);
}
