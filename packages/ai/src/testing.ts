import type { z } from 'zod';
import { LlmInvalidOutputError, LlmUnavailableError } from './errors';
import type { GenerateJsonRequest, GenerateJsonResult, LlmClient, Sensitivity } from './types';

export type FakeRequest = GenerateJsonRequest<z.ZodType>;

/** Deterministic LlmClient for tests: `respond` returns the raw model output (validated by the request schema) or throws. */
export class FakeLlmClient implements LlmClient {
  readonly calls: FakeRequest[] = [];
  private readonly respond: (req: FakeRequest) => unknown;
  private readonly available: readonly Sensitivity[];

  constructor(respond: (req: FakeRequest) => unknown, available: readonly Sensitivity[] = ['public']) {
    this.respond = respond;
    this.available = available;
  }

  isAvailable(sensitivity: Sensitivity): boolean {
    return this.available.includes(sensitivity);
  }

  model(sensitivity: Sensitivity): string {
    return `fake-${sensitivity}`;
  }

  async generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>> {
    if (!this.isAvailable(req.sensitivity)) throw new LlmUnavailableError(req.sensitivity);
    this.calls.push(req);
    const raw = await this.respond(req);
    const usage = { requests: 1, inputTokens: 100, outputTokens: 50 };
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new LlmInvalidOutputError('fake output does not match the schema', JSON.stringify(raw), usage);
    return { data: parsed.data, usage, model: this.model(req.sensitivity) };
  }
}
