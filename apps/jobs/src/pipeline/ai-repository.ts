import type { JobEnrichment, LlmUsage, Sensitivity } from '@jp/ai';
import { type RemoteType, SENIORITIES, type Seniority } from '@jp/core';
import type { Json, TablesUpdate } from '@jp/db';
import type { Db } from '../db';

/** AI quotas and our counters run on UTC days. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export type EnrichCandidate = {
  id: string;
  title: string;
  company: string;
  descriptionText: string;
  location: string | null;
  salaryRaw: string | null;
  tags: string[];
  remoteType: RemoteType;
  seniority: Seniority | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  enrichAttempts: number;
};

export async function getJobsToEnrich(db: Db, limit: number, onlyJobIds?: string[]): Promise<EnrichCandidate[]> {
  const { data: ids, error } = await db.rpc('jobs_to_enrich', {
    p_limit: limit,
    ...(onlyJobIds ? { p_job_ids: onlyJobIds } : {}),
  });
  if (error) throw error;
  if (ids.length === 0) return [];
  const { data, error: jobsError } = await db
    .from('jobs')
    .select(
      'id, title, description_text, location, salary_raw, tags, remote_type, seniority, salary_min_usd, salary_max_usd, enrich_attempts, companies(name)',
    )
    .in('id', ids);
  if (jobsError) throw jobsError;
  const byId = new Map(data.map((j) => [j.id, j]));
  return ids.flatMap((id) => {
    const j = byId.get(id);
    if (!j) return [];
    return [
      {
        id: j.id,
        title: j.title,
        company: j.companies?.name ?? '',
        descriptionText: j.description_text,
        location: j.location,
        salaryRaw: j.salary_raw,
        tags: j.tags,
        remoteType: (['remote', 'hybrid', 'office'] as const).find((r) => r === j.remote_type) ?? 'unknown',
        seniority: (SENIORITIES as readonly string[]).includes(j.seniority ?? '') ? (j.seniority as Seniority) : null,
        salaryMinUsd: j.salary_min_usd,
        salaryMaxUsd: j.salary_max_usd,
        enrichAttempts: j.enrich_attempts,
      },
    ];
  });
}

/** AI fills gaps; it never overrides a level, work format or salary the source already gave us. */
export function enrichmentPatch(job: EnrichCandidate, e: JobEnrichment, now: Date): TablesUpdate<'jobs'> {
  const hasSalary = job.salaryMinUsd != null || job.salaryMaxUsd != null;
  const aiSalary = e.salaryMinUsd != null || e.salaryMaxUsd != null;
  return {
    role: e.role,
    skills: e.skills,
    lang: e.lang,
    summary: e.summary as Json,
    remote_regions: e.remoteRegions,
    is_job: e.isJob,
    seniority: job.seniority ?? e.seniority,
    remote_type: job.remoteType === 'unknown' ? e.remoteType : job.remoteType,
    ...(!hasSalary && aiSalary ? { salary_min_usd: e.salaryMinUsd, salary_max_usd: e.salaryMaxUsd } : {}),
    enriched_at: now.toISOString(),
    enrich_error: null,
  };
}

export async function saveEnrichment(db: Db, jobId: string, patch: TablesUpdate<'jobs'>): Promise<void> {
  const { error } = await db.from('jobs').update(patch).eq('id', jobId);
  if (error) throw error;
}

export async function recordEnrichFailure(db: Db, job: EnrichCandidate, message: string): Promise<void> {
  const { error } = await db
    .from('jobs')
    .update({ enrich_attempts: job.enrichAttempts + 1, enrich_error: message.slice(0, 500) })
    .eq('id', job.id);
  if (error) throw error;
}

export async function getAiRequestsToday(db: Db, now: Date, sensitivity: Sensitivity): Promise<number> {
  const { data, error } = await db.from('ai_usage').select('requests').eq('day', utcDay(now)).eq('sensitivity', sensitivity);
  if (error) throw error;
  return data.reduce((sum, row) => sum + row.requests, 0);
}

export async function recordAiUsage(db: Db, now: Date, sensitivity: Sensitivity, model: string, usage: LlmUsage): Promise<void> {
  if (usage.requests === 0) return;
  const { error } = await db.rpc('record_ai_usage', {
    p_day: utcDay(now),
    p_sensitivity: sensitivity,
    p_model: model,
    p_requests: usage.requests,
    p_input: usage.inputTokens,
    p_output: usage.outputTokens,
  });
  if (error) throw error;
}
