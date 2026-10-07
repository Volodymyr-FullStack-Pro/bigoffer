import type { NextRequest } from 'next/server';

/** Request header the proxy sets to the current path + search, so a sign-in redirect can come back to it. */
export const REQUEST_PATH_HEADER = 'x-bigoffer-path';

/** Path + search of a page request, without Next's internal `_rsc` cache-busting parameter. */
export function requestPath(request: NextRequest): string {
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc');
  return `${url.pathname}${url.search}`;
}
