import { EXPLAIN_BATCH, explainMatches, LlmError, LlmRateLimitError } from '@jp/ai';
import type { Locale } from '@jp/core';
import {
  getAiRequestsToday,
  getExplainDetails,
  getMatchesToExplain,
  recordAiUsage,
  saveExplanation,
  type ExplainDetail,
} from './ai-repository';
import { type AiDeps, type AiStatus, isTransient, pacer } from './enrich';

export const EXPLAIN_PER_USER_DAILY = 20;
export const EXPLAIN_MIN_SCORE = 50;

export type ExplainDeps = AiDeps & { perUserLimit?: number; onlyUserIds?: string[] };
export type ExplainResult = { status: AiStatus; explained: number; requests: number; retryAfterMs: number | null };

type Batch = { locale: Locale; details: ExplainDetail[] };

/** Groups each user's picks by search profile (criteria differ) into chunks the model takes in one call. */
function batches(picks: { matchId: string; userId: string; locale: Locale }[], details: Map<string, ExplainDetail>): Batch[] {
  const groups = new Map<string, Batch>();
  for (const pick of picks) {
    const detail = details.get(pick.matchId);
    if (!detail) continue;
    const key = `${pick.userId}:${detail.profileId ?? '-'}`;
    const group = groups.get(key) ?? { locale: pick.locale, details: [] };
    group.details.push(detail);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((g) => {
    const out: Batch[] = [];
    for (let i = 0; i < g.details.length; i += EXPLAIN_BATCH) out.push({ locale: g.locale, details: g.details.slice(i, i + EXPLAIN_BATCH) });
    return out;
  });
}

export async function explainTopMatches(deps: ExplainDeps): Promise<ExplainResult> {
  const { db, llm } = deps;
  const result: ExplainResult = { status: 'ok', explained: 0, requests: 0, retryAfterMs: null };
  if (!llm.isAvailable('public')) return { ...result, status: 'unavailable' };

  const now = deps.now?.() ?? new Date();
  let budget = deps.dailyLimit - (await getAiRequestsToday(db, now, 'public'));
  if (budget <= 0) return { ...result, status: 'daily_limit' };

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const picks = await getMatchesToExplain(db, dayStart, deps.perUserLimit ?? EXPLAIN_PER_USER_DAILY, EXPLAIN_MIN_SCORE, deps.onlyUserIds);
  const details = new Map<string, ExplainDetail>();
  for (const locale of new Set(picks.map((p) => p.locale))) {
    const ids = picks.filter((p) => p.locale === locale).map((p) => p.matchId);
    for (const d of await getExplainDetails(db, ids, locale)) details.set(d.matchId, d);
  }

  const deadline = Date.now() + (deps.timeBudgetMs ?? 240_000);
  const pace = pacer(deps);
  for (const batch of batches(picks, details)) {
    const criteria = batch.details[0]!.criteria;
    if (!criteria) {
      // The search profile was deleted: nothing to explain against.
      for (const d of batch.details) await saveExplanation(db, d.matchId, batch.locale, null, now);
      continue;
    }
    if (budget <= 0) {
      result.status = 'daily_limit';
      break;
    }
    if (Date.now() > deadline) break;
    await pace();
    try {
      const res = await explainMatches(llm, { locale: batch.locale, criteria, jobs: batch.details.map((d) => d.job) });
      await recordAiUsage(db, now, 'public', res.model, res.usage);
      budget -= res.usage.requests;
      result.requests += res.usage.requests;
      for (const d of batch.details) {
        const text = res.explanations.get(d.matchId) ?? null;
        await saveExplanation(db, d.matchId, batch.locale, text, now);
        if (text) result.explained += 1;
      }
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
      if (!(err instanceof LlmError)) throw err;
      // A deterministic failure (bad output, 4xx) would repeat every hour: mark the batch as done.
      for (const d of batch.details) await saveExplanation(db, d.matchId, batch.locale, null, now);
    }
  }
  return result;
}
