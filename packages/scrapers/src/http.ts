import { type AdapterContext, SourceBlockedError } from './types';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

export type HttpOptions = {
  userAgent: string;
  timeoutMs?: number;
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export function createHttpContext(
  opts: HttpOptions,
  env: Record<string, string | undefined> = {},
): AdapterContext {
  const { userAgent, timeoutMs = 20_000, retries = 2, minDelayMs = 1_000, maxDelayMs = 4_000 } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  let requests = 0;

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    if (requests++ > 0) await sleep(minDelayMs + Math.round(random() * (maxDelayMs - minDelayMs)));
    const headers = new Headers(init.headers);
    if (!headers.has('user-agent')) headers.set('user-agent', userAgent);

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      if (res.status === 403 || res.status === 429) throw new SourceBlockedError(res.status, url);
      if (res.status >= 500 && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    }
  }

  return {
    env,
    fetchText: async (url, init) => (await request(url, init)).text(),
    fetchJson: async <T>(url: string, init?: RequestInit) => (await (await request(url, init)).json()) as T,
  };
}
