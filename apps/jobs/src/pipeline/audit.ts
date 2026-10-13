import { type AuditFinding, auditEnrichment, type AuditJob, AUDIT_BATCH, type LlmClient } from '@jp/ai';
import type { BotApi } from '@jp/core';
import type { Db } from '../db';
import { recordAiUsage } from './ai-repository';

/** Fields a user acts on (format, pay, "is this a job"); skills and level slips are reported but do not alert. */
const HARD_FIELDS = new Set(['remote_type', 'salary', 'is_job']);
/** Alert when this many sampled cards have a hard-field error. */
const ALERT_JOBS = 3;

export type AuditResult = { checked: number; findings: AuditFinding[]; hardJobs: number; alerted: boolean };

/**
 * Daily: the public model re-reads a random sample of yesterday's enriched cards against their postings. Only public
 * job data is sent.
 */
export async function auditRecentEnrichment(
  db: Db,
  deps: { llm: LlmClient; now: Date; bot?: BotApi | null; ownerChatId?: number | null },
): Promise<AuditResult> {
  const since = new Date(deps.now.getTime() - 24 * 3600_000).toISOString();
  const { data, error } = await db
    .from('jobs')
    .select('id, title, location, description_text, remote_type, seniority, salary_raw, salary_min_usd, salary_max_usd, skills, is_job')
    .gte('enriched_at', since)
    .limit(200);
  if (error) throw error;
  const sample = [...data].sort(() => Math.random() - 0.5).slice(0, AUDIT_BATCH);
  if (sample.length === 0) return { checked: 0, findings: [], hardJobs: 0, alerted: false };
  const jobs: AuditJob[] = sample.map((j) => ({
    id: j.id,
    title: j.title,
    location: j.location,
    description: j.description_text ?? '',
    remoteType: j.remote_type as AuditJob['remoteType'],
    seniority: j.seniority as AuditJob['seniority'],
    salaryRaw: j.salary_raw,
    salaryMinUsd: j.salary_min_usd,
    salaryMaxUsd: j.salary_max_usd,
    skills: j.skills ?? [],
    isJob: j.is_job,
  }));
  const { findings, usage, model } = await auditEnrichment(deps.llm, jobs);
  await recordAiUsage(db, deps.now, 'public', model, usage);
  const hardJobs = new Set(findings.filter((f) => HARD_FIELDS.has(f.field)).map((f) => f.jobId)).size;
  let alerted = false;
  if (hardJobs >= ALERT_JOBS && deps.bot && deps.ownerChatId) {
    const titles = new Map(jobs.map((j) => [j.id, j.title]));
    const lines = findings
      .filter((f) => HARD_FIELDS.has(f.field))
      .slice(0, 8)
      .map((f) => `• ${titles.get(f.jobId)}: ${f.field} "${f.stored}" → ${f.correct}`);
    const res = await deps.bot.sendMessage(deps.ownerChatId, `⚠️ BigOffer AI audit: ${hardJobs} of ${jobs.length} cards wrong\n${lines.join('\n')}`);
    alerted = res.ok;
  }
  return { checked: jobs.length, findings, hardJobs, alerted };
}
