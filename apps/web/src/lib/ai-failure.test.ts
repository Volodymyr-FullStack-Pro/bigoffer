import { LlmError, LlmInvalidOutputError, LlmRateLimitError, LlmUnavailableError } from '@jp/ai';
import { describe, expect, it } from 'vitest';
import { aiErrorStatus, classifyAiFailure, describeAiFailure } from './ai-failure';

class FakeApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const wrapped = (message: string, status: number) => new LlmError(message, status, { cause: new FakeApiError(message, status) });

describe('classifyAiFailure', () => {
  it('maps rate limits to ai_provider_limit', () => {
    expect(classifyAiFailure(new LlmRateLimitError('quota', 1000))).toBe('ai_provider_limit');
    expect(classifyAiFailure(wrapped('{"error":{"status":"RESOURCE_EXHAUSTED"}}', 429))).toBe('ai_provider_limit');
  });

  it('maps an invalid key or missing permission to ai_key_invalid', () => {
    expect(classifyAiFailure(wrapped('{"error":{"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}', 400))).toBe('ai_key_invalid');
    expect(classifyAiFailure(wrapped('unauthenticated', 401))).toBe('ai_key_invalid');
    expect(classifyAiFailure(wrapped('{"error":{"status":"PERMISSION_DENIED"}}', 403))).toBe('ai_key_invalid');
  });

  it('keeps other failures as parse_failed', () => {
    expect(classifyAiFailure(wrapped('Request contains an invalid argument.', 400))).toBe('parse_failed');
    expect(classifyAiFailure(wrapped('overloaded', 503))).toBe('parse_failed');
    expect(classifyAiFailure(new LlmInvalidOutputError('response is not JSON', 'raw cv text', { requests: 1, inputTokens: 0, outputTokens: 0 }))).toBe('parse_failed');
    expect(classifyAiFailure(new Error('boom'))).toBe('parse_failed');
    expect(classifyAiFailure('weird')).toBe('parse_failed');
  });

  it('maps a missing key to ai_unavailable', () => {
    expect(classifyAiFailure(new LlmUnavailableError('private'))).toBe('ai_unavailable');
  });

  it('reads the status from the error or its cause', () => {
    expect(aiErrorStatus(wrapped('x', 403))).toBe(403);
    expect(aiErrorStatus(new Error('x', { cause: new FakeApiError('x', 500) }))).toBe(500);
    expect(aiErrorStatus(new LlmError('timeout'))).toBeNull();
  });
});

describe('describeAiFailure', () => {
  it('logs name, status and a truncated message', () => {
    const line = describeAiFailure(wrapped(`{"error":{"code":429,"message":"${'x'.repeat(500)}"}}`, 429));
    expect(line).toMatch(/^LlmError status=429 message="/);
    expect(line.length).toBeLessThan(260);
  });

  it('never logs the raw model output or API keys', () => {
    const invalid = new LlmInvalidOutputError('response is not JSON', 'SECRET CV TEXT', { requests: 1, inputTokens: 0, outputTokens: 0 });
    expect(describeAiFailure(invalid)).not.toContain('SECRET CV TEXT');
    const leaky = wrapped('bad request https://x.googleapis.com/v1?key=AIzaSyA1234567890abcdefghijklmnopqrstu', 400);
    expect(describeAiFailure(leaky)).not.toContain('AIzaSy');
  });
});
