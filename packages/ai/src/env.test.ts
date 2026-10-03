import { describe, expect, it } from 'vitest';
import { createLlmClient, readAiEnv } from './env';

describe('readAiEnv', () => {
  it('defaults to Gemini models and treats empty keys as missing', () => {
    const env = readAiEnv({ GEMINI_API_KEY_PUBLIC: 'k', GEMINI_API_KEY_PRIVATE: '' });
    expect(env).toEqual({
      AI_PROVIDER: 'gemini',
      AI_MODEL_PUBLIC: 'gemini-flash-lite-latest',
      AI_MODEL_PRIVATE: 'gemini-flash-latest',
      GEMINI_API_KEY_PUBLIC: 'k',
      GEMINI_API_KEY_PRIVATE: undefined,
    });
    const client = createLlmClient(env);
    expect(client.isAvailable('public')).toBe(true);
    expect(client.isAvailable('private')).toBe(false);
    expect(client.model('public')).toBe('gemini-flash-lite-latest');
  });

  it('rejects an unknown provider', () => {
    expect(() => readAiEnv({ AI_PROVIDER: 'openai' })).toThrow();
  });
});
