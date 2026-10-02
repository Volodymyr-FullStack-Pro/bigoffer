import 'server-only';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@jp/core';
import { NextResponse } from 'next/server';
import { serverEnv } from '@/env';
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** `/uk/today` → `uk`; anything without a valid locale prefix → null. */
export function localeOfPath(path: string | null): Locale | null {
  if (!path) return null;
  const segment = path.split(/[/?#]/)[1];
  return isLocale(segment) ? segment : null;
}

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, serverEnv().SITE_URL));
}

export function authErrorRedirect(next: string | null) {
  return redirectTo(`/${localeOfPath(next) ?? DEFAULT_LOCALE}/login?error=auth`);
}

/**
 * Redirect after a successful sign-in. `next` must already be a safe relative path.
 * Before onboarding, the locale the user signed in with (from `next`) becomes their profile locale.
 */
export async function signedInRedirect(supabase: Supabase, userId: string, next: string | null) {
  const nextLocale = localeOfPath(next);
  const { data: profile } = await supabase
    .from('profiles')
    .select('locale, onboarded_at')
    .eq('id', userId)
    .single();

  if (next) {
    if (nextLocale && profile && !profile.onboarded_at && profile.locale !== nextLocale) {
      await supabase.from('profiles').update({ locale: nextLocale }).eq('id', userId);
    }
    return redirectTo(next);
  }
  const locale = isLocale(profile?.locale) ? profile.locale : DEFAULT_LOCALE;
  return redirectTo(`/${locale}/today`);
}
