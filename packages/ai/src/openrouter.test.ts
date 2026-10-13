import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmError } from './errors';
import { LlmInvalidOutputError, LlmRateLimitError } from './errors';
import { createOpenRouterClient, REASONING_HEADROOM_TOKENS, withRoutes } from './openrouter';
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
  it('leaves room for thinking on top of the answer budget', async () => {
    const seen: { init?: RequestInit }[] = [];
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: fakeFetch(200, { choices: [{ message: { content: '{"a":"hi"}' } }] }, seen) });
    await client.generateJson({ ...req, maxOutputTokens: 4000 });
    expect(JSON.parse(String(seen[0]!.init!.body)).max_tokens).toBe(4000 + REASONING_HEADROOM_TOKENS);
  });
  it('turns an HTTP error into an LlmError with the status', async () => {
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: fakeFetch(502, { error: { message: 'down', code: 502 } }) });
    await expect(client.generateJson(req)).rejects.toMatchObject({ status: 502 });
  });
});

describe('withRoutes', () => {
  it('sends writer requests to the writer, public ones to the public model, the rest to the base client', async () => {
    const base = new FakeLlmClient(() => ({ a: 'base' }), ['private']);
    const client = withRoutes(base, { writer: new FakeLlmClient(() => ({ a: 'writer' }), ['private']), public: new FakeLlmClient(() => ({ a: 'public' }), ['public']) });
    expect((await client.generateJson(req)).data).toEqual({ a: 'writer' });
    expect((await client.generateJson({ ...req, tier: 'fast' })).data).toEqual({ a: 'base' });
    expect((await client.generateJson({ ...req, tier: undefined, sensitivity: 'public' })).data).toEqual({ a: 'public' });
    // Enrichment runs even without a free-tier Gemini key.
    expect(client.isAvailable('public')).toBe(true);
  });
  it('falls back to the base client when a routed model fails', async () => {
    const base = new FakeLlmClient(() => ({ a: 'base' }), ['private', 'public']);
    const down = new FakeLlmClient(() => {
      throw new LlmError('down', 503);
    }, ['private', 'public']);
    const client = withRoutes(base, { writer: down, public: down });
    expect((await client.generateJson(req)).data).toEqual({ a: 'base' });
    expect((await client.generateJson({ ...req, tier: undefined, sensitivity: 'public' })).data).toEqual({ a: 'base' });
  });
});

describe('letter route', () => {
  it('sends only the cover letter to the letter model', async () => {
    const base = new FakeLlmClient(() => ({ a: 'base' }), ['private']);
    const client = withRoutes(base, { writer: new FakeLlmClient(() => ({ a: 'writer' }), ['private']), letter: new FakeLlmClient(() => ({ a: 'letter' }), ['private']) });
    expect((await client.generateJson(req)).data).toEqual({ a: 'letter' });
    expect((await client.generateJson({ ...req, task: 'form_answers' })).data).toEqual({ a: 'writer' });
  });
});

describe('withRoutes errors', () => {
  it('does not fall back on a broken answer, and reports the routed error when the fallback fails too', async () => {
    const quota = new FakeLlmClient(() => {
      throw new LlmError('quota', 429);
    }, ['public']);
    const broken = new FakeLlmClient(() => {
      throw new LlmInvalidOutputError('bad', '{}', { requests: 1, inputTokens: 0, outputTokens: 0 });
    }, ['public']);
    const down = new FakeLlmClient(() => {
      throw new LlmError('down', 502);
    }, ['public']);
    const pub = { ...req, tier: undefined, sensitivity: 'public' as const };
    await expect(withRoutes(quota, { public: broken }).generateJson(pub)).rejects.toBeInstanceOf(LlmInvalidOutputError);
    expect(quota.calls).toHaveLength(0);
    await expect(withRoutes(quota, { public: down }).generateJson(pub)).rejects.toMatchObject({ status: 502 });
  });
});

describe('schema retry', () => {
  it('asks once more when the answer breaks the schema', async () => {
    const replies = [{ choices: [{ message: { content: '{"b":1}' } }] }, { choices: [{ message: { content: '{"a":"ok"}' } }] }];
    const f = (async () => new Response(JSON.stringify(replies.shift()), { status: 200 })) as unknown as typeof fetch;
    const client = createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: f });
    expect((await client.generateJson(req)).data).toEqual({ a: 'ok' });
  });
  it('gives up after the second broken answer', async () => {
    const f = (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'nope' } }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(createOpenRouterClient({ apiKey: 'k', model: 'm', fetch: f }).generateJson(req)).rejects.toBeInstanceOf(LlmInvalidOutputError);
  });
});

describe('free tier first for public data', () => {
  const pub = { ...req, tier: undefined, sensitivity: 'public' as const };
  it('uses the free tier, falls to the paid model on 429 and skips the free tier until its retry time', async () => {
    let t = 0;
    let freeCalls = 0;
    const free = new FakeLlmClient(() => {
      freeCalls += 1;
      if (freeCalls === 2) throw new LlmRateLimitError('quota', 30_000);
      return { a: 'free' };
    }, ['private', 'public']);
    const paid = new FakeLlmClient(() => ({ a: 'paid' }), ['public']);
    const client = withRoutes(free, { public: paid, publicFreeFirst: true, now: () => t });
    expect((await client.generateJson(pub)).data).toEqual({ a: 'free' });
    expect((await client.generateJson(pub)).data).toEqual({ a: 'paid' });
    t = 10_000;
    expect((await client.generateJson(pub)).data).toEqual({ a: 'paid' });
    expect(freeCalls).toBe(2);
    t = 31_000;
    expect((await client.generateJson(pub)).data).toEqual({ a: 'free' });
  });
  it('never sends personal data to the free tier', async () => {
    const free = new FakeLlmClient(() => ({ a: 'free' }), ['private', 'public']);
    const client = withRoutes(free, { writer: new FakeLlmClient(() => ({ a: 'writer' }), ['private']), public: new FakeLlmClient(() => ({ a: 'paid' }), ['public']), publicFreeFirst: true });
    expect((await client.generateJson(req)).data).toEqual({ a: 'writer' });
  });
});
