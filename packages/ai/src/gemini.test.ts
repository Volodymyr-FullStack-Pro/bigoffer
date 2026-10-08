import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmError, LlmInvalidOutputError, LlmRateLimitError, LlmUnavailableError } from './errors';
import { createGeminiClient, type GeminiResponse } from './gemini';

const schema = z.object({ answer: z.string() });
const ok = (text: string, prompt = 10, out = 3): GeminiResponse => ({
  text,
  usageMetadata: { promptTokenCount: prompt, candidatesTokenCount: out },
});

function setup(responses: (GeminiResponse | Error)[], keys: { publicKey?: string; privateKey?: string } = { publicKey: 'pub-key' }) {
  const calls: { apiKey: string; params: Record<string, unknown> }[] = [];
  const client = createGeminiClient({
    ...keys,
    publicModel: 'model-public',
    privateModel: 'model-private',
    connect: (apiKey) => async (params) => {
      calls.push({ apiKey, params: params as unknown as Record<string, unknown> });
      const next = responses.shift();
      if (!next) throw new Error('no more fake responses');
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { client, calls };
}

describe('createGeminiClient', () => {
  it('asks for JSON by schema and returns parsed data with usage', async () => {
    const { client, calls } = setup([ok('{"answer":"42"}')]);
    const res = await client.generateJson({ sensitivity: 'public', schema, system: 'Be terse.', prompt: 'Q?' });
    expect(res).toEqual({ data: { answer: '42' }, usage: { requests: 1, inputTokens: 10, outputTokens: 3 }, model: 'model-public' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.apiKey).toBe('pub-key');
    expect(calls[0]!.params).toMatchObject({
      model: 'model-public',
      contents: [{ role: 'user', parts: [{ text: 'Q?' }] }],
      config: { systemInstruction: 'Be terse.', responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } },
    });
  });

  it('puts images before the text part', async () => {
    const { client, calls } = setup([ok('{"answer":"cat"}')]);
    await client.generateJson({
      sensitivity: 'public',
      schema,
      system: 's',
      prompt: 'What is it?',
      images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }],
    });
    expect(calls[0]!.params).toMatchObject({
      contents: [{ parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }, { text: 'What is it?' }] }],
    });
  });

  it('never sends private data with the public key', async () => {
    const { client, calls } = setup([]);
    expect(client.isAvailable('public')).toBe(true);
    expect(client.isAvailable('private')).toBe(false);
    await expect(client.generateJson({ sensitivity: 'private', schema, system: 's', prompt: 'cv' })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(calls).toHaveLength(0);
  });

  it('uses the private key and model for private requests', async () => {
    const { client, calls } = setup([ok('{"answer":"x"}')], { publicKey: 'pub-key', privateKey: 'priv-key' });
    const res = await client.generateJson({ sensitivity: 'private', schema, system: 's', prompt: 'cv' });
    expect(calls[0]!.apiKey).toBe('priv-key');
    expect(res.model).toBe('model-private');
  });

  it('retries once on invalid output and sums usage', async () => {
    const { client, calls } = setup([ok('not json', 10, 2), ok('{"answer":"ok"}', 10, 3)]);
    const res = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' });
    expect(res.data).toEqual({ answer: 'ok' });
    expect(res.usage).toEqual({ requests: 2, inputTokens: 20, outputTokens: 5 });
    expect(calls).toHaveLength(2);
  });

  it('gives up after two invalid outputs and reports the usage spent', async () => {
    const { client } = setup([ok('{"answer":1}'), ok('')]);
    const err = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmInvalidOutputError);
    expect((err as LlmInvalidOutputError).usage.requests).toBe(2);
  });

  it('maps 429 to LlmRateLimitError with the server retry delay', async () => {
    const body = JSON.stringify({ error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } });
    const { client } = setup([new ApiError({ message: body, status: 429 })]);
    const err = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRateLimitError);
    expect((err as LlmRateLimitError).retryAfterMs).toBe(37_000);
  });

  it('maps other API and network errors to LlmError with status', async () => {
    const { client } = setup([new ApiError({ message: 'overloaded', status: 503 }), new TypeError('fetch failed')]);
    const first = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(LlmError);
    expect((first as LlmError).status).toBe(503);
    const second = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(LlmError);
    expect((second as LlmError).status).toBeNull();
  });
});
