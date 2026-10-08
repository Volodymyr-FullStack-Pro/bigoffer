import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { REQUEST_PATH_HEADER, requestPath } from './lib/request-path';
import { refreshSession } from './lib/supabase/proxy';

const handleI18n = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  // Refresh first: next-intl clones request.headers, so the fresh session cookie must already be there.
  const pending = await refreshSession(request);
  // Always overwritten, never trusted from the client; readers still validate it as a same-origin path.
  request.headers.set(REQUEST_PATH_HEADER, requestPath(request));
  const response = handleI18n(request);
  for (const { name, value, options } of pending.cookies) response.cookies.set(name, value, options);
  for (const [key, value] of Object.entries(pending.headers)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: '/((?!api|auth|_next|_vercel|.*\\..*).*)',
};
