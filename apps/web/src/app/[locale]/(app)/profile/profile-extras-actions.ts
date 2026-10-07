'use server';

import { isLocale, type Locale } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const KEY = /^[a-z0-9_]{1,40}$/;

function slug(question: string): string {
  const base = question.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);
  return `${base || 'q'}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function saveBankAnswer(input: { key: string | null; question: string; answer: string; locale: Locale }): Promise<{ ok: boolean; key?: string }> {
  const userId = await getUserId();
  const question = input.question.trim().slice(0, 300);
  const answer = input.answer.trim().slice(0, 2000);
  if (!userId || !question || !isLocale(input.locale) || (input.key !== null && !KEY.test(input.key))) return { ok: false };
  const key = input.key ?? slug(question);
  const supabase = await createClient();
  const { data: existing } = await supabase.from('answer_bank').select('answer').eq('key', key).maybeSingle();
  const merged = { ...((existing?.answer ?? {}) as Record<string, string>), [input.locale]: answer };
  const { error } = await supabase.from('answer_bank').upsert({ user_id: userId, key, question, answer: merged }, { onConflict: 'user_id,key' });
  revalidatePath('/[locale]/profile', 'page');
  return error ? { ok: false } : { ok: true, key };
}

export async function deleteBankAnswer(key: string): Promise<boolean> {
  if (!(await getUserId()) || !KEY.test(key)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('answer_bank').delete().eq('key', key).select('id');
  revalidatePath('/[locale]/profile', 'page');
  return !error && (data?.length ?? 0) > 0;
}

export async function saveLetterTemplate(locale: Locale, body: string): Promise<boolean> {
  const userId = await getUserId();
  const text = body.trim().slice(0, 5000);
  if (!userId || !isLocale(locale) || !text) return false;
  const supabase = await createClient();
  const { error } = await supabase.from('letter_templates').upsert({ user_id: userId, locale, body: text }, { onConflict: 'user_id,locale' });
  revalidatePath('/[locale]/profile', 'page');
  return !error;
}
