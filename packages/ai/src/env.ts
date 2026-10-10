import { z } from 'zod';
import { createGeminiClient } from './gemini';
import { FakeLlmClient, fakeResponder } from './testing';
import type { LlmClient } from './types';

const aiEnvSchema = z.object({
  AI_PROVIDER: z.enum(['gemini', 'fake']).default('gemini'),
  AI_MODEL_PUBLIC: z.string().min(1).default('gemini-flash-lite-latest'),
  AI_MODEL_PRIVATE: z.string().min(1).default('gemini-flash-latest'),
  AI_MODEL_PRIVATE_FAST: z.string().min(1).default('gemini-flash-lite-latest'),
  GEMINI_API_KEY_PUBLIC: z.string().min(1).optional(),
  GEMINI_API_KEY_PRIVATE: z.string().min(1).optional(),
  ALLOW_FAKE_AI: z.string().optional(),
});
export type AiEnv = z.infer<typeof aiEnvSchema>;

/** The fake provider needs ALLOW_FAKE_AI=1 and a non-production NODE_ENV. */
function assertFakeAllowed(env: AiEnv, nodeEnv: string | undefined = process.env.NODE_ENV): void {
  if (env.AI_PROVIDER !== 'fake') return;
  if (env.ALLOW_FAKE_AI !== '1' || nodeEnv === 'production') {
    throw new Error('AI_PROVIDER=fake requires ALLOW_FAKE_AI=1 and is never allowed in production');
  }
}

export function readAiEnv(env: Record<string, string | undefined> = process.env): AiEnv {
  const pick = (key: keyof AiEnv) => env[key] || undefined;
  const parsed = aiEnvSchema.parse({
    AI_PROVIDER: pick('AI_PROVIDER'),
    AI_MODEL_PUBLIC: pick('AI_MODEL_PUBLIC'),
    AI_MODEL_PRIVATE: pick('AI_MODEL_PRIVATE'),
    AI_MODEL_PRIVATE_FAST: pick('AI_MODEL_PRIVATE_FAST'),
    GEMINI_API_KEY_PUBLIC: pick('GEMINI_API_KEY_PUBLIC'),
    GEMINI_API_KEY_PRIVATE: pick('GEMINI_API_KEY_PRIVATE'),
    ALLOW_FAKE_AI: pick('ALLOW_FAKE_AI'),
  });
  assertFakeAllowed(parsed, env.NODE_ENV || process.env.NODE_ENV);
  return parsed;
}

export function createLlmClient(env: AiEnv): LlmClient {
  switch (env.AI_PROVIDER) {
    case 'fake':
      assertFakeAllowed(env);
      return new FakeLlmClient(fakeResponder, ['public', 'private']);
    case 'gemini':
      return createGeminiClient({
        publicKey: env.GEMINI_API_KEY_PUBLIC,
        privateKey: env.GEMINI_API_KEY_PRIVATE,
        publicModel: env.AI_MODEL_PUBLIC,
        privateModel: env.AI_MODEL_PRIVATE,
        privateFastModel: env.AI_MODEL_PRIVATE_FAST,
      });
  }
}
