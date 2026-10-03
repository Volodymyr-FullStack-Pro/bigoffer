import { enrichJob, LlmError, LlmInvalidOutputError, type LlmClient, LlmRateLimitError } from '@jp/ai';
import type { Db } from '../db';
import {
  enrichmentPatch,
  getAiRequestsToday,
  getJobsToEnrich,
  recordAiUsage,
  recordEnrichFailure,
  saveEnrichment,
} from './ai-repository';
import { rescoreJobs } from './rescore';

export type AiDeps = {
  db: Db;
  llm: LlmClient;
  /** Requests per UTC day across all public AI work (enrichment + explanations). */
  dailyLimit: number;
  /** Minimum time between request starts (free-tier RPM). */
  minIntervalMs?: number;
  /** Stop starting new requests after this long (Trigger.dev maxDuration headroom). */
  timeBudgetMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

export type AiStatus = 'ok' | 'unavailable' | 'daily_limit' | 'rate_limited' | 'provider_error';

export type EnrichDeps = AiDeps & { batchSize: number; onlyJobIds?: string[] };

export type EnrichResult = {
  status: AiStatus;
  enriched: number;
  notJobs: number;
  failed: number;
  rescored: number;
  retryAfterMs: number | null;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns a function to await before each request: keeps request starts minIntervalMs apart. */
export function pacer(deps: AiDeps): () => Promise<void> {
  const sleep = deps.sleep ?? realSleep;
  const interval = deps.minIntervalMs ?? 4500;
  let last = Number.NEGATIVE_INFINITY;
  return async () => {
    const wait = last + interval - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
}

/**
 * Provider trouble that is not the job's fault: stop the batch, keep the job's attempts.
 * Includes configuration errors (bad/revoked key, wrong model): they hit every request, so retrying per job
 * would burn all attempts and mark everything as done.
 */
export function isTransient(err: LlmError): boolean {
  // Invalid output carries no status but is the job's (or prompt's) problem, so it counts as an attempt.
  if (err instanceof LlmInvalidOutputError) return false;
  const { status } = err;
  if (status === null || status >= 500) return true;
  if (status === 401 || status === 403 || status === 404) return true;
  return status === 400 && /api[_ ]?key/i.test(err.message);
}

export async function enrichJobs(deps: EnrichDeps): Promise<EnrichResult> {
  const { db, llm } = deps;
  const result: EnrichResult = { status: 'ok', enriched: 0, notJobs: 0, failed: 0, rescored: 0, retryAfterMs: null };
  if (!llm.isAvailable('public')) return { ...result, status: 'unavailable' };

  const now = deps.now?.() ?? new Date();
  const budget = Math.min(deps.batchSize, deps.dailyLimit - (await getAiRequestsToday(db, now, 'public')));
  if (budget <= 0) return { ...result, status: 'daily_limit' };

  const candidates = await getJobsToEnrich(db, budget, deps.onlyJobIds);
  const started = Date.now();
  const deadline = started + (deps.timeBudgetMs ?? 240_000);
  const pace = pacer(deps);
  const done: string[] = [];
  let unexpected: unknown;

  for (const job of candidates) {
    if (Date.now() > deadline) break;
    await pace();
    try {
      const { enrichment, usage, model } = await enrichJob(llm, job);
      await recordAiUsage(db, now, 'public', model, usage);
      await saveEnrichment(db, job.id, enrichmentPatch(job, enrichment, now));
      done.push(job.id);
      result.enriched += 1;
      if (!enrichment.isJob) result.notJobs += 1;
    } catch (err) {
      if (err instanceof LlmRateLimitError) {
        result.status = 'rate_limited';
        result.retryAfterMs = err.retryAfterMs;
        break;
      }
      if (err instanceof LlmError && isTransient(err)) {
        result.status = 'provider_error';
        break;
      }
      if (err instanceof LlmError) {
        if (err instanceof LlmInvalidOutputError) await recordAiUsage(db, now, 'public', llm.model('public'), err.usage);
        await recordEnrichFailure(db, job, err.message);
        result.failed += 1;
        continue;
      }
      unexpected = err;
      break;
    }
  }

  // Rescore what was enriched even if the batch stopped early, so finished work reaches users now.
  result.rescored = await rescoreJobs(db, done);
  if (unexpected !== undefined) throw unexpected;
  return result;
}
