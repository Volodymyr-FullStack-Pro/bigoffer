'use server';

import { isLocale, type Locale } from '@jp/core';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export async function setLocaleAction(locale: Locale) {
  if (!isLocale(locale)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return;
  await supabase.from('profiles').update({ locale }).eq('id', userId);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: '/login', locale: await getLocale() });
}
