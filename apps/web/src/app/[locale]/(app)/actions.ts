'use server';

import { isLocale, type Locale } from '@jp/core';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function setLocaleAction(locale: Locale) {
  if (!isLocale(locale)) return;
  const userId = await getUserId();
  if (!userId) return;
  const supabase = await createClient();
  await supabase.from('profiles').update({ locale }).eq('id', userId);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: '/login', locale: await getLocale() });
}
