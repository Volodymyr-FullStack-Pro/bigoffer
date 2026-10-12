import type { z } from 'zod';
import { LlmError, LlmInvalidOutputError, LlmRateLimitError } from './errors';
import { toResponseJsonSchema } from './json-schema';
import type { GenerateJsonRequest, GenerateJsonResult, LlmClient, LlmUsage } from './types';

export type OpenRouterOptions = {
  apiKey: string;
  /** e.g. "anthropic/claude-sonnet-5.5". */
  model: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
};

type ChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number };
};

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Writing model behind OpenRouter (cover letters, form answers, recruiter messages). Private data only goes to
 * providers that neither store nor train on it (`data_collection: deny`), and the schema is enforced by the provider.
 */
export function createOpenRouterClient(opts: OpenRouterOptions): LlmClient {
  const doFetch = opts.fetch ?? fetch;
  async function attempt<S extends z.ZodType>(
    req: GenerateJsonRequest<S>,
  ): Promise<GenerateJsonResult<z.output<S>>> {
    if (req.files?.length || req.images?.length)
      throw new LlmError('OpenRouter client does not take files', null);
    const body = {
      model: opts.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
      // No temperature: newer Claude models reject it, and with require_parameters that leaves no endpoint at all.
      max_tokens: req.maxOutputTokens ?? 2048,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: (req.task ?? 'result').replace(/[^\w-]/g, '_').slice(0, 64),
          strict: true,
          schema: toResponseJsonSchema(req.schema),
        },
      },
      provider: { data_collection: 'deny', require_parameters: true },
    };
    let res: Response;
    try {
      res = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'BigOffer',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? 60_000),
      });
    } catch (err) {
      throw new LlmError(err instanceof Error ? err.message : String(err), null, { cause: err });
    }
    const json = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok || json.error) {
      const status = json.error?.code ?? res.status;
      const message = json.error?.message ?? `HTTP ${res.status}`;
      throw status === 429 ? new LlmRateLimitError(message, null) : new LlmError(message, status);
    }
    const usage: LlmUsage = {
      requests: 1,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    let data: unknown;
    try {
      data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      throw new LlmInvalidOutputError('response is not JSON', text, usage);
    }
    const parsed = req.schema.safeParse(data);
    if (!parsed.success)
      throw new LlmInvalidOutputError('response does not match the schema', text, usage);
    return { data: parsed.data, usage, model: opts.model };
  }

  return {
    isAvailable: () => true,
    model: () => opts.model,
    async generateJson(req) {
      try {
        return await attempt(req);
      } catch (err) {
        // Cheap models occasionally break the schema; one more try usually fixes it.
        if (err instanceof LlmInvalidOutputError) return attempt(req);
        throw err;
      }
    },
  };
}

export type Routes = {
  /** Text sent to companies (`tier: 'writer'`): cover letters, form answers, recruiter messages. */
  writer?: LlmClient | null;
  /** Public data (job enrichment, explanations): no daily free-tier quota. */
  public?: LlmClient | null;
};

/**
 * Sends writer requests and public-data requests to their OpenRouter models and the rest to the base client; when a
 * routed model fails for any reason the base client answers, so a user waiting on screen still gets a result and
 * enrichment keeps going on the free tier.
 */
export function withRoutes(base: LlmClient, routes: Routes): LlmClient {
  const { writer, public: publicClient } = routes;
  if (!writer && !publicClient) return base;
  const pick = (req: GenerateJsonRequest<z.ZodType>): LlmClient | null | undefined =>
    req.tier === 'writer' ? writer : req.sensitivity === 'public' ? publicClient : null;
  return {
    isAvailable: (s) => (s === 'public' && publicClient ? true : base.isAvailable(s)),
    model: (s) => (s === 'public' && publicClient ? publicClient.model(s) : base.model(s)),
    async generateJson(req) {
      const routed = pick(req);
      if (!routed) return base.generateJson(req);
      try {
        return await routed.generateJson(req);
      } catch (err) {
        console.error(
          'routed model failed, falling back',
          err instanceof LlmError ? err.status : 'unknown',
        );
        if (!base.isAvailable(req.sensitivity)) throw err;
        return base.generateJson(req);
      }
    },
  };
}
