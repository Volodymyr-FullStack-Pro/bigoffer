import { z } from 'zod';
import { createGeminiClient } from './gemini';
import type { LlmClient } from './types';

const aiEnvSchema = z.object({
  AI_PROVIDER: z.enum(['gemini']).default('gemini'),
  AI_MODEL_PUBLIC: z.string().min(1).default('gemini-flash-lite-latest'),
  AI_MODEL_PRIVATE: z.string().min(1).default('gemini-flash-latest'),
  GEMINI_API_KEY_PUBLIC: z.string().min(1).optional(),
  GEMINI_API_KEY_PRIVATE: z.string().min(1).optional(),
});
export type AiEnv = z.infer<typeof aiEnvSchema>;

export function readAiEnv(env: Record<string, string | undefined> = process.env): AiEnv {
  const pick = (key: keyof AiEnv) => env[key] || undefined;
  return aiEnvSchema.parse({
    AI_PROVIDER: pick('AI_PROVIDER'),
    AI_MODEL_PUBLIC: pick('AI_MODEL_PUBLIC'),
    AI_MODEL_PRIVATE: pick('AI_MODEL_PRIVATE'),
    GEMINI_API_KEY_PUBLIC: pick('GEMINI_API_KEY_PUBLIC'),
    GEMINI_API_KEY_PRIVATE: pick('GEMINI_API_KEY_PRIVATE'),
  });
}

export function createLlmClient(env: AiEnv): LlmClient {
  switch (env.AI_PROVIDER) {
    case 'gemini':
      return createGeminiClient({
        publicKey: env.GEMINI_API_KEY_PUBLIC,
        privateKey: env.GEMINI_API_KEY_PRIVATE,
        publicModel: env.AI_MODEL_PUBLIC,
        privateModel: env.AI_MODEL_PRIVATE,
      });
  }
}
