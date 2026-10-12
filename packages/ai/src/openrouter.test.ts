import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmError } from './errors';
import { createOpenRouterClient, withWriter } from './openrouter';
import { FakeLlmClient } from './testing';

const schema = z.object({ a: z.string() });
const req = { sensitivity: 'private' as const, task: 'apply_kit', schema, system: 'sys', prompt: 'p', tier: 'writer' as const };

function fakeFetch(status: number, body: unknown, seen: { init?: RequestInit }[] = []) {
  return (async (_url: string, init?: RequestInit) => {
    seen.push({ init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe('createOpenRouterClient', () => {
  it('asks for the schema, forbids data collection and parses the answer', async () => {
    const seen: { init?: RequestInit }[] = [];
    const client = createOpenRouterClient({ apiKey: 'k', model: 'anthropic/claude-sonnet-5.5', fetch: fakeFetch(200, { choices: [{ message: { content: '{"a":"hi"}' } }], usage: { prompt_tokens: 10, completion_tokens: 3 } }, seen) });
    const res = await client.generateJson(req);
    expect(res).toEqual({ data: { a: 'hi' }, usage: { requests: 1, inputTokens: 10, outputTokens: 3 }, model: 'anthropic/claude-sonnet-5.5' });
    const body = JSON.parse(String(seen[0]!.init!.body));
    expect(body.provider).toEqual({ data_collection: 'deny', require_parameters: true });
    expect(body.response_format.json_schema).toMatchObject({ name: 'apply_kit', strict: true });
  });
  it('turns an HTTP error into an LlmError with the status', async () => {
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: fakeFetch(502, { error: { message: 'down', code: 502 } }) });
    await expect(client.generateJson(req)).rejects.toMatchObject({ status: 502 });
  });
});

describe('withWriter', () => {
  it('sends writer requests to the writer and the rest to the base client', async () => {
    const base = new FakeLlmClient(() => ({ a: 'base' }), ['private']);
    const writer = new FakeLlmClient(() => ({ a: 'writer' }), ['private']);
    const client = withWriter(base, writer);
    expect((await client.generateJson(req)).data).toEqual({ a: 'writer' });
    expect((await client.generateJson({ ...req, tier: 'fast' })).data).toEqual({ a: 'base' });
  });
  it('falls back to the base client when the writer fails', async () => {
    const base = new FakeLlmClient(() => ({ a: 'base' }), ['private']);
    const writer = new FakeLlmClient(() => {
      throw new LlmError('down', 503);
    }, ['private']);
    expect((await withWriter(base, writer).generateJson(req)).data).toEqual({ a: 'base' });
  });
});
