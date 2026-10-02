import { safeRedirectPath } from '@jp/core';
import type { NextRequest } from 'next/server';
import { authErrorRedirect, signedInRedirect } from '@/lib/auth-redirect';
import { createClient } from '@/lib/supabase/server';

/** OAuth (Google) PKCE callback. Email links go through /auth/confirm. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return signedInRedirect(supabase, data.user.id, next);
  }
  return authErrorRedirect(next);
}
