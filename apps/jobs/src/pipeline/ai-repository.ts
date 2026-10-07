import type { ExplainCriteria, ExplainJob, JobEnrichment, LlmUsage, Sensitivity } from '@jp/ai';
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  type LocalizedText,
  localized,
  type RemoteType,
  SEARCH_REMOTE_TYPES,
  SENIORITIES,
  type Seniority,
} from '@jp/core';
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

export async function getMatchesToExplain(
  db: Db,
  dayStart: Date,
  perUser: number,
  minScore: number,
  onlyUserIds?: string[],
): Promise<{ matchId: string; userId: string; locale: Locale }[]> {
  const { data, error } = await db.rpc('matches_to_explain', {
    p_day_start: dayStart.toISOString(),
    p_per_user: perUser,
    p_min_score: minScore,
    ...(onlyUserIds ? { p_user_ids: onlyUserIds } : {}),
  });
  if (error) throw error;
  return data.map((r) => ({ matchId: r.match_id, userId: r.user_id, locale: isLocale(r.locale) ? r.locale : DEFAULT_LOCALE }));
}

export type ExplainDetail = { matchId: string; profileId: string | null; criteria: ExplainCriteria | null; job: ExplainJob };

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

export async function getExplainDetails(db: Db, matchIds: string[], locale: Locale): Promise<ExplainDetail[]> {
  if (matchIds.length === 0) return [];
  const data = [];
  // Chunked: a long id list does not fit into one PostgREST URL.
  for (let i = 0; i < matchIds.length; i += 200) {
    const { data: chunk, error } = await db
      .from('job_matches')
      .select(
        'id, breakdown, search_profile_id, jobs!inner(title, summary, skills, seniority, remote_type, location, salary_min_usd, salary_max_usd, companies(name)), search_profiles(keywords, skills, seniority, remote_type, salary_min_usd)',
      )
      .in('id', matchIds.slice(i, i + 200));
    if (error) throw error;
    data.push(...chunk);
  }
  const order = new Map(matchIds.map((id, i) => [id, i]));
  return data
    .map((m): ExplainDetail => {
      const sp = m.search_profiles;
      const breakdown = (m.breakdown ?? {}) as { matchedSkills?: unknown };
      return {
        matchId: m.id,
        profileId: m.search_profile_id,
        criteria: sp
          ? {
              keywords: sp.keywords,
              skills: sp.skills,
              seniority: sp.seniority.filter((s): s is Seniority => (SENIORITIES as readonly string[]).includes(s)),
              remoteType: SEARCH_REMOTE_TYPES.find((r) => r === sp.remote_type) ?? 'any',
              salaryMinUsd: sp.salary_min_usd,
            }
          : null,
        job: {
          id: m.id,
          title: m.jobs.title,
          company: m.jobs.companies?.name ?? '',
          summary: localized(m.jobs.summary as LocalizedText | null, locale) || null,
          skills: m.jobs.skills,
          matchedSkills: asStrings(breakdown.matchedSkills),
          seniority: (SENIORITIES as readonly string[]).includes(m.jobs.seniority ?? '') ? (m.jobs.seniority as Seniority) : null,
          remoteType: (['remote', 'hybrid', 'office'] as const).find((r) => r === m.jobs.remote_type) ?? 'unknown',
          location: m.jobs.location,
          salaryMinUsd: m.jobs.salary_min_usd,
          salaryMaxUsd: m.jobs.salary_max_usd,
        },
      };
    })
    .sort((a, b) => order.get(a.matchId)! - order.get(b.matchId)!);
}

/** explained_at is set even without a text, so a match the model skipped is not retried every hour. */
export async function saveExplanation(db: Db, matchId: string, locale: Locale, text: string | null, now: Date): Promise<void> {
  const { error } = await db
    .from('job_matches')
    .update({ explanation: text ? { [locale]: text } : null, explained_at: now.toISOString() })
    .eq('id', matchId);
  if (error) throw error;
}
