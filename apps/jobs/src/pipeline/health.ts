import type { BotApi } from '@jp/core';
import type { Db } from '../db';

export type SourceHealthRow = {
  source_id: string;
  runs_6h: number;
  ok_runs_6h: number;
  blocked_runs_6h: number;
  found_6h: number;
  last_ok_run_at: string | null;
  new_jobs_24h: number;
  pct_company: number | null;
  pct_description: number | null;
  pct_posted: number | null;
  pct_location: number | null;
  pct_salary: number | null;
  newest_posted_at: string | null;
};

export type HealthIssue = { key: string; text: string };

/** What a healthy board looks like (measured on production, Oct 2026), with room for normal variation. */
const EXPECT: Record<string, { maxRunGapHours: number; location: number; salary: number }> = {
  // DOU postings rarely state pay (2–5% of new ones): only an empty field means a broken parser.
  dou: { maxRunGapHours: 2, location: 80, salary: 2 },
  djinni: { maxRunGapHours: 3, location: 50, salary: 5 },
  robotaua: { maxRunGapHours: 3, location: 80, salary: 15 },
};
const DEFAULT_EXPECT = { maxRunGapHours: 3, location: 50, salary: 0 };
const FIELD_MIN = { company: 80, description: 80, posted: 90 };
/** Below this many new jobs a day the shares are noise (a quiet Sunday). */
const MIN_SAMPLE = 10;
const MIN_SALARY_SAMPLE = 20;
const MAX_ENRICH_BACKLOG = 10;

/** The problems in one hourly health snapshot; empty when everything looks normal. */
export function evaluateHealth(rows: SourceHealthRow[], enrichBacklog: number, now: Date): HealthIssue[] {
  const issues: HealthIssue[] = [];
  for (const r of rows) {
    const s = r.source_id;
    const expect = EXPECT[s] ?? DEFAULT_EXPECT;
    const lastOk = r.last_ok_run_at ? Date.parse(r.last_ok_run_at) : null;
    const gapHours = lastOk === null ? null : (now.getTime() - lastOk) / 3600_000;
    if (gapHours === null || gapHours > expect.maxRunGapHours) {
      issues.push({ key: `${s}:stopped`, text: `${s}: no successful run for ${gapHours === null ? 'over a week' : `${Math.floor(gapHours)} h`}` });
    }
    if (r.runs_6h > 0 && r.found_6h === 0) issues.push({ key: `${s}:empty`, text: `${s}: ${r.runs_6h} runs in 6 h found nothing (markup or API changed?)` });
    if (r.blocked_runs_6h >= 2) issues.push({ key: `${s}:blocked`, text: `${s}: blocked ${r.blocked_runs_6h} times in 6 h` });
    if (r.new_jobs_24h >= MIN_SAMPLE) {
      const low = (field: string, pct: number | null, min: number) => {
        if (pct !== null && pct < min) issues.push({ key: `${s}:${field}`, text: `${s}: ${field} on ${pct}% of new jobs (expected ≥ ${min}%)` });
      };
      low('company', r.pct_company, FIELD_MIN.company);
      low('description', r.pct_description, FIELD_MIN.description);
      low('posted date', r.pct_posted, FIELD_MIN.posted);
      low('location', r.pct_location, expect.location);
    }
    if (r.new_jobs_24h >= MIN_SALARY_SAMPLE && r.pct_salary !== null && r.pct_salary < expect.salary) {
      issues.push({ key: `${s}:salary`, text: `${s}: salary on ${r.pct_salary}% of new jobs (expected ≥ ${expect.salary}%)` });
    }
  }
  if (enrichBacklog > MAX_ENRICH_BACKLOG) {
    issues.push({ key: 'ai:enrich-backlog', text: `AI: ${enrichBacklog} matched jobs wait over an hour for enrichment` });
  }
  return issues;
}

export type HealthResult = { issues: HealthIssue[]; alerted: number; rows: SourceHealthRow[]; enrichBacklog: number };

/**
 * Reads the snapshot, evaluates it and tells the owner about problems not reported in the last 24 hours. The owner
 * chat is optional: without it the issues only reach the task log (and fail the run).
 */
export async function checkHealth(
  db: Db,
  deps: { now: Date; bot?: BotApi | null; ownerChatId?: number | null },
): Promise<HealthResult> {
  const nowIso = deps.now.toISOString();
  const { data: rows, error } = await db.rpc('source_health', { p_now: nowIso });
  if (error) throw error;
  const { data: backlog, error: backlogError } = await db.rpc('enrich_backlog', { p_now: nowIso });
  if (backlogError) throw backlogError;
  const issues = evaluateHealth(rows as SourceHealthRow[], backlog ?? 0, deps.now);
  let alerted = 0;
  if (issues.length > 0 && deps.bot && deps.ownerChatId) {
    const dayAgo = new Date(deps.now.getTime() - 24 * 3600_000).toISOString();
    const { data: recent, error: recentError } = await db
      .from('health_alerts')
      .select('key')
      .in('key', issues.map((i) => i.key))
      .gte('sent_at', dayAgo);
    if (recentError) throw recentError;
    const already = new Set(recent.map((r) => r.key));
    const fresh = issues.filter((i) => !already.has(i.key));
    if (fresh.length > 0) {
      const res = await deps.bot.sendMessage(deps.ownerChatId, `⚠️ BigOffer health\n${fresh.map((i) => `• ${i.text}`).join('\n')}`);
      if (res.ok) {
        const { error: upsertError } = await db
          .from('health_alerts')
          .upsert(fresh.map((i) => ({ key: i.key, sent_at: nowIso })), { onConflict: 'key' });
        if (upsertError) throw upsertError;
        alerted = fresh.length;
      }
    }
  }
  return { issues, alerted, rows: rows as SourceHealthRow[], enrichBacklog: backlog ?? 0 };
}
