import { describe, expect, it, vi } from 'vitest';
import { createHttpContext } from '../src/http';
import { SourceBlockedError } from '../src/types';

const sleep = vi.fn(async () => {});

function fakeFetch(...responses: (Response | Error)[]) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
}

describe('createHttpContext', () => {
  it('sends the user agent and returns text', async () => {
    const fetchImpl = fakeFetch(new Response('ok'));
    const ctx = createHttpContext({ userAgent: 'UA/1', fetchImpl, sleep });
    expect(await ctx.fetchText('https://a.test/')).toBe('ok');
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toBe('UA/1');
  });

  it('waits between consecutive requests', async () => {
    sleep.mockClear();
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(new Response('1'), new Response('2')), sleep, random: () => 0.5, minDelayMs: 1000, maxDelayMs: 3000 });
    await ctx.fetchText('https://a.test/1');
    await ctx.fetchText('https://a.test/2');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('retries 5xx and network errors, then succeeds', async () => {
    const fetchImpl = fakeFetch(new Response('', { status: 502 }), new Error('ECONNRESET'), new Response('{"a":1}'));
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl, sleep, retries: 2 });
    expect(await ctx.fetchJson('https://a.test/')).toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws SourceBlockedError on 403 and 429 without retrying', async () => {
    const fetchImpl = fakeFetch(new Response('', { status: 429 }));
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl, sleep });
    await expect(ctx.fetchText('https://a.test/')).rejects.toBeInstanceOf(SourceBlockedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws on other client errors', async () => {
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(new Response('', { status: 404 })), sleep });
    await expect(ctx.fetchText('https://a.test/x')).rejects.toThrow('HTTP 404');
  });
});

describe('renderPage', () => {
  it('lazily creates the renderer, paces with fetches and disposes', async () => {
    sleep.mockClear();
    const render = vi.fn(async () => '<html>ok</html>');
    const close = vi.fn(async () => {});
    const factory = vi.fn(async () => ({ render, close }));
    const ctx = createHttpContext(
      { userAgent: 'UA', fetchImpl: fakeFetch(new Response('x')), sleep, random: () => 0, minDelayMs: 1000, maxDelayMs: 1000 },
      {},
      factory,
    );
    await ctx.fetchText('https://a.test/');
    expect(await ctx.renderPage!('https://b.test/', { waitForSelector: '.card' })).toBe('<html>ok</html>');
    await ctx.renderPage!('https://b.test/2');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith('https://b.test/', { waitForSelector: '.card' });
    expect(sleep).toHaveBeenCalledTimes(2);
    await ctx.dispose!();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent renders and launches one renderer', async () => {
    let active = 0;
    let max = 0;
    const render = vi.fn(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return 'h';
    });
    const factory = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { render, close: async () => {} };
    });
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(), sleep }, {}, factory);
    await Promise.all([ctx.renderPage!('https://b.test/1'), ctx.renderPage!('https://b.test/2')]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(2);
    expect(max).toBe(1);
  });

  it('has no renderPage without a factory and dispose is a no-op', async () => {
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(), sleep });
    expect(ctx.renderPage).toBeUndefined();
    await expect(ctx.dispose!()).resolves.toBeUndefined();
  });

  it('masks credentials in error messages', async () => {
    const url = 'https://a.test/s?app_id=id1&app_key=SECRET&what=x';
    const blocked = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(new Response('', { status: 429 })), sleep });
    await expect(blocked.fetchText(url)).rejects.toThrow(/app_key=\*\*\*&what=x/);
    const failed = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(new Response('', { status: 404 })), sleep });
    const err = await failed.fetchText(url).catch((e: Error) => e);
    expect((err as Error).message).not.toContain('SECRET');
    expect((err as Error).message).toContain('app_key=***');
  });
});
