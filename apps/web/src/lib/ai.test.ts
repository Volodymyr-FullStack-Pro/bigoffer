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
