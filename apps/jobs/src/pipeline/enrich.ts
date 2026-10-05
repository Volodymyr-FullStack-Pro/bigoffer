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
import { getActiveProfiles } from './repository';
import { rescoreJobs } from './rescore';

export type AiDeps = {
  db: Db;
  llm: LlmClient;
  /** Requests per UTC day across all public AI work (enrichment + explanations). */
  dailyLimit: number;
  /** Minimum time between request starts (free-tier RPM). */
  minIntervalMs?: number;
  /**
   * Stop starting new requests after this long. Default 120s leaves room for one slow request
   * (incl. its retry) within the Trigger.dev maxDuration of 300s.
   */
  timeBudgetMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

export type AiStatus = 'ok' | 'unavailable' | 'daily_limit' | 'rate_limited' | 'provider_error';

export type EnrichDeps = AiDeps & {
  batchSize: number;
  onlyJobIds?: string[];
  /** Rescore enriched jobs only for these users (tests). */
  onlyUserIds?: string[];
};

/** Why a batch stopped early (provider_error / rate_limited), for the task logs. */
export type AiError = { status: number | null; message: string } | null;

export type EnrichResult = {
  status: AiStatus;
  enriched: number;
  notJobs: number;
  failed: number;
  rescored: number;
  retryAfterMs: number | null;
  error: AiError;
};

export const DEFAULT_TIME_BUDGET_MS = 120_000;
/** Consecutive counted 4xx failures (not invalid output) after which the batch stops as a provider error. */
export const MAX_CONSECUTIVE_CLIENT_ERRORS = 3;

export function aiError(err: LlmError): NonNullable<AiError> {
  return { status: err.status, message: err.message.slice(0, 300) };
}

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
  const result: EnrichResult = { status: 'ok', enriched: 0, notJobs: 0, failed: 0, rescored: 0, retryAfterMs: null, error: null };
  if (!llm.isAvailable('public')) return { ...result, status: 'unavailable' };

  const now = deps.now?.() ?? new Date();
  const budget = Math.min(deps.batchSize, deps.dailyLimit - (await getAiRequestsToday(db, now, 'public')));
  if (budget <= 0) return { ...result, status: 'daily_limit' };

  const candidates = await getJobsToEnrich(db, budget, deps.onlyJobIds);
  if (candidates.length === 0) return result;
  const profiles = await getActiveProfiles(db);
  const deadline = Date.now() + (deps.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const pace = pacer(deps);
  let clientErrors = 0;

  for (const job of candidates) {
    if (Date.now() > deadline) break;
    await pace();
    try {
      const { enrichment, usage, model } = await enrichJob(llm, job);
      await recordAiUsage(db, now, 'public', model, usage);
      await saveEnrichment(db, job.id, enrichmentPatch(job, enrichment, now));
      clientErrors = 0;
      result.enriched += 1;
      if (!enrichment.isJob) result.notJobs += 1;
    } catch (err) {
      if (err instanceof LlmRateLimitError) {
        result.status = 'rate_limited';
        result.retryAfterMs = err.retryAfterMs;
        result.error = aiError(err);
        break;
      }
      if (err instanceof LlmError && isTransient(err)) {
        result.status = 'provider_error';
        result.error = aiError(err);
        break;
      }
      if (!(err instanceof LlmError)) throw err;
      if (err instanceof LlmInvalidOutputError) {
        await recordAiUsage(db, now, 'public', llm.model('public'), err.usage);
        clientErrors = 0;
      } else {
        clientErrors += 1;
      }
      await recordEnrichFailure(db, job, err.message);
      result.failed += 1;
      // The same 4xx on every request is a configuration problem, not the jobs': don't burn the queue.
      if (clientErrors >= MAX_CONSECUTIVE_CLIENT_ERRORS) {
        result.status = 'provider_error';
        result.error = aiError(err);
        break;
      }
      continue;
    }
    // Rescore right away: a run killed later must not leave enriched jobs that never get rescored.
    result.rescored += await rescoreJobs(db, [job.id], { profiles, onlyUserIds: deps.onlyUserIds });
  }
  return result;
}
