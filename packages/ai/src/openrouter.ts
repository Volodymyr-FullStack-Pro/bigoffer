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
  return {
    isAvailable: () => true,
    model: () => opts.model,
    async generateJson<S extends z.ZodType>(
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
        temperature: 0.3,
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
    },
  };
}

/**
 * Sends `tier: 'writer'` requests to the writing model and everything else to the base client; when the writer
 * fails for any reason the base client answers, so a user waiting on screen still gets a result.
 */
export function withWriter(base: LlmClient, writer: LlmClient | null): LlmClient {
  if (!writer) return base;
  return {
    isAvailable: (s) => base.isAvailable(s),
    model: (s) => base.model(s),
    async generateJson(req) {
      if (req.tier !== 'writer') return base.generateJson(req);
      try {
        return await writer.generateJson(req);
      } catch (err) {
        console.error(
          'writer model failed, falling back',
          err instanceof LlmError ? err.status : 'unknown',
        );
        return base.generateJson(req);
      }
    },
  };
}
