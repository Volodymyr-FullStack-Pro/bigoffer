import { safeRedirectPath } from '@jp/core';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorRedirect, exchangeCodeAndRedirect, signedInRedirect } from '@/lib/auth-redirect';
import { createClient } from '@/lib/supabase/server';

const emailOtpType = z.enum(['email', 'magiclink', 'signup', 'recovery', 'invite', 'email_change']);

/**
 * Email links (magic link / signup confirmation):
 * - `token_hash` + `type`: custom templates (local dev); no PKCE verifier, so any device works.
 * - `code`: Supabase default templates ({{ .ConfirmationURL }}) redirect back with a PKCE code;
 *   it must be opened in the browser that requested the link (code verifier cookie).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get('next'));
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = emailOtpType.safeParse(searchParams.get('type'));

  if (tokenHash && type.success) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type: type.data, token_hash: tokenHash });
    if (!error && data.user) return signedInRedirect(supabase, data.user.id, next);
  }
  if (code) return exchangeCodeAndRedirect(code, next);
  return authErrorRedirect(next);
}
