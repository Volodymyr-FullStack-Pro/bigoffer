import 'server-only';
import { type Locale, safeRedirectPath } from '@jp/core';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { REQUEST_PATH_HEADER } from '@/lib/request-path';
import { createClient } from '@/lib/supabase/server';

/** Current user id from the verified JWT claims, or null when signed out. */
export async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

/** `/uk` and `/uk/today` are where sign-in lands anyway; every other page is worth coming back to. */
const DEFAULT_LANDING_RE = /^\/[a-z]{2}(?:\/today)?\/?$/;

/** The page being requested (same-origin relative path + search), when it is worth returning to after sign-in. */
async function returnPath(): Promise<string | null> {
  const path = safeRedirectPath((await headers()).get(REQUEST_PATH_HEADER));
  return path && !DEFAULT_LANDING_RE.test(path) ? path : null;
}

/** Current user id; redirects to the (localized) login page — with `next` = the current page — when signed out. */
export async function requireUserId(locale?: Locale): Promise<string> {
  const userId = await getUserId();
  if (userId) return userId;
  const next = await returnPath();
  return redirect({
    href: next ? { pathname: '/login', query: { next } } : '/login',
    locale: locale ?? (await getLocale()),
  });
}
