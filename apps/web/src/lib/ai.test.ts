import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('privateAiAvailable', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns false instead of throwing on invalid AI config', async () => {
    vi.stubEnv('AI_PROVIDER', 'definitely-not-a-provider');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.resetModules();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { privateAiAvailable } = await import('./ai');
    expect(privateAiAvailable()).toBe(false);
    expect(privateAiAvailable()).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('private AI quota', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads the daily limit from env with a default of 100', async () => {
    const { privateAiDailyLimit } = await import('./ai');
    expect(privateAiDailyLimit({})).toBe(100);
    expect(privateAiDailyLimit({ PRIVATE_AI_DAILY_LIMIT: '30' })).toBe(30);
    expect(privateAiDailyLimit({ PRIVATE_AI_DAILY_LIMIT: 'nope' })).toBe(100);
    expect(privateAiDailyLimit({ PRIVATE_AI_DAILY_LIMIT: '0' })).toBe(0);
  });
  it('asks the database to consume one request and fails closed on errors', async () => {
    vi.stubEnv('PRIVATE_AI_DAILY_LIMIT', '');
    const { consumePrivateAi } = await import('./ai');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: unknown[] = [];
    const ok = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: true, error: null }; } };
    expect(await consumePrivateAi(ok as never)).toBe(true);
    expect(calls).toEqual([['consume_private_ai', { p_limit: 100 }]]);
    const over = { rpc: async () => ({ data: false, error: null }) };
    expect(await consumePrivateAi(over as never)).toBe(false);
    const broken = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    expect(await consumePrivateAi(broken as never)).toBe(false);
    spy.mockRestore();
  });
});
