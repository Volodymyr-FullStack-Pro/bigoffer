import type { Locale } from '@jp/core';
import { cvSignedUrl, loadPrimaryCv } from '@/lib/cv';
import type { createClient } from '@/lib/supabase/server';
import type { BankAnswer } from './answer-bank';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadProfileExtras(supabase: Supabase, userId: string, locale: Locale) {
  const cv = await loadPrimaryCv(supabase);
  const cvLink = cv ? await cvSignedUrl(supabase, cv.path) : null;
  const { data: bank } = await supabase.from('answer_bank').select('key, question, answer').eq('user_id', userId).order('updated_at');
  const answers: BankAnswer[] = (bank ?? []).map((a) => ({
    key: a.key,
    question: a.question,
    answer: typeof a.answer === 'object' && a.answer !== null ? ((a.answer as Record<string, string>)[locale] ?? '') : '',
  }));
  return { cv, cvLink, answers };
}
