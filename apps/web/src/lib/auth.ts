import 'server-only';
import type { Locale } from '@jp/core';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

/** Current user id from the verified JWT claims, or null when signed out. */
export async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

/** Current user id; redirects to the (localized) login page when signed out. */
export async function requireUserId(locale?: Locale): Promise<string> {
  const userId = await getUserId();
  if (!userId) return redirect({ href: '/login', locale: locale ?? (await getLocale()) });
  return userId;
}
