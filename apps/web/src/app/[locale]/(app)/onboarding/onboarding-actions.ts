'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function finishOnboarding(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const supabase = await createClient();
  await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', userId);
  redirect({ href: '/today', locale: await getLocale() });
}
