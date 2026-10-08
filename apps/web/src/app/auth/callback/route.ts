import { safeRedirectPath } from '@jp/core';
import type { NextRequest } from 'next/server';
import { exchangeCodeAndRedirect } from '@/lib/auth-redirect';

/** OAuth (Google) PKCE callback. Email links go through /auth/confirm. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return exchangeCodeAndRedirect(searchParams.get('code'), safeRedirectPath(searchParams.get('next')));
}
