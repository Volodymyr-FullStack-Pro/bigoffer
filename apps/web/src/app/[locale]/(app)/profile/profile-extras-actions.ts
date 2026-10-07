'use server';

import { isLocale, type Locale } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const KEY = /^[a-z0-9_]{1,40}$/;

const bankInput = z.object({ key: z.string().regex(KEY).nullable(), question: z.string(), answer: z.string(), locale: z.string() });
const keyInput = z.string().regex(KEY);
const templateInput = z.object({ locale: z.string(), body: z.string() });

function revalidate() {
  revalidatePath('/[locale]/profile', 'page');
  revalidatePath('/[locale]/onboarding', 'page');
}

function slug(question: string): string {
  const base = question.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);
  return `${base || 'q'}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function saveBankAnswer(input: { key: string | null; question: string; answer: string; locale: Locale }): Promise<{ ok: boolean; key?: string }> {
  const parsed = bankInput.safeParse(input);
  const userId = await getUserId();
  if (!parsed.success || !userId || !isLocale(parsed.data.locale)) return { ok: false };
  const locale: Locale = parsed.data.locale;
  const question = parsed.data.question.trim().slice(0, 300);
  const answer = parsed.data.answer.trim().slice(0, 2000);
  if (!question) return { ok: false };
  const key = parsed.data.key ?? slug(question);
  const supabase = await createClient();
  const { data: existing } = await supabase.from('answer_bank').select('answer').eq('key', key).maybeSingle();
  const merged = { ...((existing?.answer ?? {}) as Record<string, string>), [locale]: answer };
  const { error } = await supabase.from('answer_bank').upsert({ user_id: userId, key, question, answer: merged }, { onConflict: 'user_id,key' });
  revalidate();
  return error ? { ok: false } : { ok: true, key };
}

export async function deleteBankAnswer(key: string): Promise<boolean> {
  if (!keyInput.safeParse(key).success || !(await getUserId())) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('answer_bank').delete().eq('key', key).select('id');
  revalidate();
  return !error && (data?.length ?? 0) > 0;
}

export async function saveLetterTemplate(locale: Locale, body: string): Promise<boolean> {
  const parsed = templateInput.safeParse({ locale, body });
  const userId = await getUserId();
  if (!parsed.success || !userId || !isLocale(parsed.data.locale)) return false;
  const text = parsed.data.body.trim().slice(0, 5000);
  if (!text) return false;
  const tplLocale: Locale = parsed.data.locale;
  const supabase = await createClient();
  const { error } = await supabase.from('letter_templates').upsert({ user_id: userId, locale: tplLocale, body: text }, { onConflict: 'user_id,locale' });
  revalidate();
  return !error;
}
