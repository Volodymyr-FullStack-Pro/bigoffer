import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { refreshSession } from './lib/supabase/proxy';

const handleI18n = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  // Refresh first: next-intl clones request.headers, so the fresh session cookie must already be there.
  const pending = await refreshSession(request);
  const response = handleI18n(request);
  for (const { name, value, options } of pending.cookies) response.cookies.set(name, value, options);
  for (const [key, value] of Object.entries(pending.headers)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: '/((?!api|auth|_next|_vercel|.*\\..*).*)',
};
