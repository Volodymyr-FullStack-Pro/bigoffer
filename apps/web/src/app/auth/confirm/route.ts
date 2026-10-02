import { safeRedirectPath } from '@jp/core';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorRedirect, signedInRedirect } from '@/lib/auth-redirect';
import { createClient } from '@/lib/supabase/server';

const emailOtpType = z.enum(['email', 'magiclink', 'signup', 'recovery', 'invite', 'email_change']);

/** Token-hash email links (magic link / signup confirmation): no PKCE verifier, so any device works. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get('next'));
  const tokenHash = searchParams.get('token_hash');
  const type = emailOtpType.safeParse(searchParams.get('type'));

  if (tokenHash && type.success) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type: type.data, token_hash: tokenHash });
    if (!error && data.user) return signedInRedirect(supabase, data.user.id, next);
  }
  return authErrorRedirect(next);
}
