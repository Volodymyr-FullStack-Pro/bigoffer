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
  /**
   * Thinking effort. Omitted = the model's default (best for writing). 'low' = a small budget for extraction tasks,
   * 'off' = none where the model allows it. Thinking models can otherwise exceed the request timeout on large inputs.
   */
  thinking?: 'off' | 'low';
  /** Per-request HTTP timeout; defaults to the client's 60 s. */
  timeoutMs?: number;
  /**
   * 'fast' = the provider's quick model, for text the user waits for on screen (cover letters, form answers):
   * the full Flash model took 2+ minutes (504 deadline) on a letter brief that Flash-Lite answers in seconds.
   */
  tier?: 'fast';
};

export type GenerateJsonResult<T> = { data: T; usage: LlmUsage; model: string };

export interface LlmClient {
  /** True when a key for this sensitivity is configured. Private requests never fall back to the public key. */
  isAvailable(sensitivity: Sensitivity): boolean;
  /** Model used for this sensitivity (usage accounting, logs). */
  model(sensitivity: Sensitivity): string;
  generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>>;
}
