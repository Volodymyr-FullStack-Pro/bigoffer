import type { LlmUsage, Sensitivity } from './types';

export class LlmError extends Error {
  /** HTTP status from the provider; null for network errors and timeouts. */
  readonly status: number | null;
  constructor(message: string, status: number | null = null, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LlmError';
    this.status = status;
  }
}

export class LlmUnavailableError extends LlmError {
  constructor(sensitivity: Sensitivity) {
    super(`No AI key configured for ${sensitivity} data`);
    this.name = 'LlmUnavailableError';
  }
}

export class LlmRateLimitError extends LlmError {
  readonly retryAfterMs: number | null;
  constructor(message: string, retryAfterMs: number | null, options?: ErrorOptions) {
    super(message, 429, options);
    this.name = 'LlmRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class LlmInvalidOutputError extends LlmError {
  readonly raw: string;
  readonly usage: LlmUsage;
  constructor(message: string, raw: string, usage: LlmUsage) {
    super(message);
    this.name = 'LlmInvalidOutputError';
    this.raw = raw;
    this.usage = usage;
  }
}
