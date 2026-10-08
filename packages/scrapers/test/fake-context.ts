import type { AdapterContext } from '../src/types';

/** Returns the body of the first route whose key is a substring of the requested URL. */
export function fakeContext(routes: Record<string, string | object>, env: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const find = (url: string) => {
    calls.push({ url });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (key === undefined) throw new Error(`No fake route for ${url}`);
    return routes[key]!;
  };
  const ctx: AdapterContext = {
    env,
    fetchText: async (url) => {
      const body = find(url);
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
    fetchJson: async <T>(url: string, init?: RequestInit) => {
      const body = find(url);
      calls[calls.length - 1]!.init = init;
      return (typeof body === 'string' ? JSON.parse(body) : body) as T;
    },
  };
  return { ctx, calls };
}
