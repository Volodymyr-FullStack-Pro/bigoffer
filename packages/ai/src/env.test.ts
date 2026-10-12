import { describe, expect, it } from 'vitest';
import { createLlmClient, readAiEnv } from './env';

describe('readAiEnv', () => {
  it('defaults to Gemini models and treats empty keys as missing', () => {
    const env = readAiEnv({ GEMINI_API_KEY_PUBLIC: 'k', GEMINI_API_KEY_PRIVATE: '' });
    expect(env).toEqual({
      AI_PROVIDER: 'gemini',
      AI_MODEL_PUBLIC: 'gemini-flash-lite-latest',
      AI_MODEL_PRIVATE: 'gemini-flash-latest',
      AI_MODEL_PRIVATE_FAST: 'gemini-flash-lite-latest',
      GEMINI_API_KEY_PUBLIC: 'k',
      GEMINI_API_KEY_PRIVATE: undefined,
      OPENROUTER_API_KEY: undefined,
      AI_MODEL_WRITER: 'anthropic/claude-haiku-5.5',
      ALLOW_FAKE_AI: undefined,
    });
    const client = createLlmClient(env);
    expect(client.isAvailable('public')).toBe(true);
    expect(client.isAvailable('private')).toBe(false);
    expect(client.model('public')).toBe('gemini-flash-lite-latest');
  });

  it('allows the fake provider only with ALLOW_FAKE_AI=1 outside production', () => {
    const ok = readAiEnv({ AI_PROVIDER: 'fake', ALLOW_FAKE_AI: '1', NODE_ENV: 'test' });
    expect(createLlmClient(ok).isAvailable('private')).toBe(true);
    expect(() => readAiEnv({ AI_PROVIDER: 'fake', NODE_ENV: 'test' })).toThrow();
    expect(() => readAiEnv({ AI_PROVIDER: 'fake', ALLOW_FAKE_AI: '1', NODE_ENV: 'production' })).toThrow();
    expect(() => createLlmClient({ ...ok, ALLOW_FAKE_AI: undefined })).toThrow();
    const prev = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = 'production';
      expect(() => createLlmClient(ok)).toThrow();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prev;
    }
  });

  it('rejects an unknown provider', () => {
    expect(() => readAiEnv({ AI_PROVIDER: 'openai' })).toThrow();
  });
});
