import { ApiError, GoogleGenAI, type GenerateContentParameters, type Part, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { z } from 'zod';
import { LlmError, LlmInvalidOutputError, LlmRateLimitError, LlmUnavailableError } from './errors';
import { toResponseJsonSchema } from './json-schema';
import type { GenerateJsonRequest, GenerateJsonResult, LlmClient, LlmUsage, Sensitivity } from './types';

export type GeminiResponse = {
  text?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};
type GenerateContent = (params: GenerateContentParameters) => Promise<GeminiResponse>;

export type GeminiOptions = {
  publicKey?: string;
  privateKey?: string;
  publicModel: string;
  privateModel: string;
  /** Test seam: builds the generateContent call for one API key. */
  connect?: (apiKey: string) => GenerateContent;
};

const ATTEMPTS = 2;

/** Small enough to stay fast, and within every Flash/Flash-Lite/Pro budget range (Flash-Lite's minimum is 512). */
const LOW_THINKING_BUDGET = 512;

/**
 * Maps the request's thinking effort to the model family's config: Gemini 3 uses thinkingLevel; 2.5 uses thinkingBudget
 * (0 = off is only valid for 2.5 Flash / Flash-Lite). Aliases like `gemini-flash-latest` get a budget, which every
 * current Flash model accepts.
 */
export function thinkingConfigFor(model: string, thinking: 'off' | 'low' | undefined): ThinkingConfig | undefined {
  if (!thinking) return undefined;
  const m = model.toLowerCase().replace(/^models\//, '');
  if (m.startsWith('gemini-3')) return { thinkingLevel: thinking === 'off' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW };
  if (thinking === 'off' && /^gemini-2\.5-flash/.test(m)) return { thinkingBudget: 0 };
  return { thinkingBudget: LOW_THINKING_BUDGET };
}

function defaultConnect(apiKey: string): GenerateContent {
  // Retries are ours: a blind SDK retry on 429 would burn the free daily quota.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000, retryOptions: { attempts: 1 } } });
  return (params) => ai.models.generateContent(params);
}

function retryDelayMs(message: string): number | null {
  const m = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.round(Number(m[1]) * 1000) : null;
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof ApiError) {
    return err.status === 429
      ? new LlmRateLimitError(err.message, retryDelayMs(err.message), { cause: err })
      : new LlmError(err.message, err.status, { cause: err });
  }
  return new LlmError(err instanceof Error ? err.message : String(err), null, { cause: err });
}

function parse<S extends z.ZodType>(schema: S, text: string | undefined): { ok: true; data: z.output<S> } | { ok: false; message: string } {
  if (!text) return { ok: false, message: 'empty response' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: 'response is not JSON' };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, message: `response does not match the schema: ${issues.join('; ')}` };
}

export function createGeminiClient(opts: GeminiOptions): LlmClient {
  const connect = opts.connect ?? defaultConnect;
  const connections = new Map<Sensitivity, GenerateContent>();
  const keyFor = (s: Sensitivity) => (s === 'public' ? opts.publicKey : opts.privateKey) || undefined;
  const modelFor = (s: Sensitivity) => (s === 'public' ? opts.publicModel : opts.privateModel);

  return {
    isAvailable: (s) => keyFor(s) !== undefined,
    model: modelFor,
    async generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>> {
      const key = keyFor(req.sensitivity);
      if (!key) throw new LlmUnavailableError(req.sensitivity);
      let call = connections.get(req.sensitivity);
      if (!call) {
        call = connect(key);
        connections.set(req.sensitivity, call);
      }
      const model = modelFor(req.sensitivity);
      const parts: Part[] = [
        ...[...(req.files ?? []), ...(req.images ?? [])].map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.dataBase64 } })),
        { text: req.prompt },
      ];
      const params: GenerateContentParameters = {
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: toResponseJsonSchema(req.schema),
          temperature: 0.2,
          maxOutputTokens: req.maxOutputTokens ?? 2048,
          ...(req.thinking ? { thinkingConfig: thinkingConfigFor(model, req.thinking) } : {}),
          ...(req.timeoutMs ? { httpOptions: { timeout: req.timeoutMs } } : {}),
        },
      };

      const usage: LlmUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };
      let failure = { message: 'no attempt made', raw: '' };
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        let res: GeminiResponse;
        try {
          res = await call(params);
        } catch (err) {
          throw toLlmError(err);
        }
        usage.requests += 1;
        usage.inputTokens += res.usageMetadata?.promptTokenCount ?? 0;
        usage.outputTokens += (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);
        const parsed = parse(req.schema, res.text);
        if (parsed.ok) return { data: parsed.data, usage, model };
        failure = { message: parsed.message, raw: res.text ?? '' };
      }
      throw new LlmInvalidOutputError(failure.message, failure.raw, usage);
    },
  };
}
