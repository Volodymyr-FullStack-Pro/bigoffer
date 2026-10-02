import type { Database } from '@jp/db';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { publicEnv } from '@/env';

export type PendingAuthWrites = {
  cookies: { name: string; value: string; options: CookieOptions }[];
  headers: Record<string, string>;
};

/**
 * Refreshes the Supabase session BEFORE any other proxy logic runs.
 * Refreshed cookies are written onto `request.cookies` (so handlers that clone the request
 * headers afterwards — e.g. next-intl — forward the fresh token to Server Components) and are
 * returned so the caller can copy them, plus the no-cache headers, onto the final response.
 */
export async function refreshSession(request: NextRequest): Promise<PendingAuthWrites> {
  const pending: PendingAuthWrites = { cookies: [], headers: {} };
  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          pending.cookies.push(...cookiesToSet);
          Object.assign(pending.headers, headers);
        },
      },
    },
  );
  await supabase.auth.getClaims();
  return pending;
}
