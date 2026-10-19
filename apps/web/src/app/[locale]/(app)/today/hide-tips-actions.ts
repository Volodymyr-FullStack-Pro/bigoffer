'use server';

import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { requestProfileSync } from '@/lib/trigger';

const TERM = /^[\p{L}\p{N}.#+ -]{1,60}$/u;

/** The user's one search (the latest), for a tip that changes it. */
async function ownSearch() {
  if (!(await getUserId())) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('search_profiles').select('id, exclude_keywords').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return data ? { supabase, search: data } : null;
}

/** "Hide jobs on another stack" turned on from a feed tip; the search is rescored. */
export async function hideOtherStacks(): Promise<boolean> {
  const own = await ownSearch();
  if (!own) return false;
  const { error } = await own.supabase.from('search_profiles').update({ hide_other_stacks: true }).eq('id', own.search.id);
  if (error) return false;
  await requestProfileSync(own.search.id);
  revalidatePath('/[locale]/today', 'page');
  return true;
}

/** Adds one exclude word from a feed tip ("Shopify"); the search is rescored. */
export async function excludeWord(term: string): Promise<boolean> {
  const word = term.trim();
  if (!TERM.test(word)) return false;
  const own = await ownSearch();
  if (!own) return false;
  const words = own.search.exclude_keywords;
  if (words.some((w) => w.toLowerCase() === word.toLowerCase())) return true;
  if (words.length >= 30) return false;
  const { error } = await own.supabase.from('search_profiles').update({ exclude_keywords: [...words, word] }).eq('id', own.search.id);
  if (error) return false;
  await requestProfileSync(own.search.id);
  revalidatePath('/[locale]/today', 'page');
  return true;
}
