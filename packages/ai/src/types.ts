import type { z } from 'zod';

/** public: data anyone can see (job postings) — free tier allowed. private: personal data — paid, no-training key only. */
export const SENSITIVITIES = ['public', 'private'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export type LlmImage = { mimeType: string; dataBase64: string };

export type LlmUsage = { requests: number; inputTokens: number; outputTokens: number };

export type GenerateJsonRequest<S extends z.ZodType> = {
  sensitivity: Sensitivity;
  /** Plain object schema without transforms: it is sent to the model as JSON Schema. */
  schema: S;
  system: string;
  prompt: string;
  images?: LlmImage[];
  /** Inline files sent with the prompt (e.g. a PDF CV). */
  files?: LlmImage[];
  /** Task label for logs and the fake provider. */
  task?: string;
  maxOutputTokens?: number;
};

export type GenerateJsonResult<T> = { data: T; usage: LlmUsage; model: string };

export interface LlmClient {
  /** True when a key for this sensitivity is configured. Private requests never fall back to the public key. */
  isAvailable(sensitivity: Sensitivity): boolean;
  /** Model used for this sensitivity (usage accounting, logs). */
  model(sensitivity: Sensitivity): string;
  generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>>;
}
