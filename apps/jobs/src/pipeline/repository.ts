import { type NormalizedJob, type ScorableJob, type SearchProfile, SENIORITIES, type Seniority } from '@jp/core';
import type { Json } from '@jp/db';
import type { Db } from '../db';

type ProfileRow = {
  id: string;
  user_id: string;
  keywords: string[];
  skills: string[];
  exclude_keywords: string[];
  seniority: string[];
  locations: string[];
  remote_type: string;
  salary_min_usd: number | null;
  is_active?: boolean;
};

const PROFILE_COLUMNS =
  'id, user_id, keywords, skills, exclude_keywords, seniority, locations, remote_type, salary_min_usd, is_active';

export function toSearchProfile(row: ProfileRow): SearchProfile {
  return {
    id: row.id,
    userId: row.user_id,
    keywords: row.keywords,
    skills: row.skills,
    excludeKeywords: row.exclude_keywords,
    seniority: row.seniority.filter((s): s is Seniority => (SENIORITIES as readonly string[]).includes(s)),
    locations: row.locations,
    remoteType: (['any', 'remote', 'hybrid', 'office'] as const).find((r) => r === row.remote_type) ?? 'any',
    salaryMinUsd: row.salary_min_usd,
  };
}

export async function getQuery(db: Db, id: string) {
  const { data, error } = await db.from('search_queries').select('id, source_id, params').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSource(db: Db, id: string) {
  const { data, error } = await db
    .from('sources')
    .select('id, enabled, min_interval_minutes, paused_until, consecutive_empty_runs')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
export type SourceRow = Awaited<ReturnType<typeof getSource>>;

export async function startRun(db: Db, sourceId: string, queryId: string, now: Date): Promise<string> {
  const { data, error } = await db
    .from('source_runs')
    .insert({ source_id: sourceId, query_id: queryId, started_at: now.toISOString() })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishRun(
  db: Db,
  runId: string,
  patch: { status: 'ok' | 'error' | 'blocked'; found: number; inserted: number; error?: string },
) {
  const { error } = await db
    .from('source_runs')
    .update({ ...patch, error: patch.error ?? null, finished_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw error;
}

export async function updateSourceHealth(
  db: Db,
  source: SourceRow,
  outcome: 'ok' | 'empty' | 'blocked',
  now: Date,
): Promise<{ alert: string | null }> {
  if (outcome === 'blocked') {
    const until = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const { error } = await db.from('sources').update({ paused_until: until }).eq('id', source.id);
    if (error) throw error;
    return { alert: `Source ${source.id} blocked us; paused until ${until}` };
  }
  const empty = outcome === 'empty' ? source.consecutive_empty_runs + 1 : 0;
  const { error } = await db.from('sources').update({ consecutive_empty_runs: empty }).eq('id', source.id);
  if (error) throw error;
  return { alert: empty === 3 ? `Source ${source.id} returned 0 jobs 3 runs in a row — markup changed?` : null };
}

export async function markQueryRun(db: Db, queryId: string, now: Date, intervalMinutes: number) {
  const next = new Date(now.getTime() + Math.max(intervalMinutes, 15) * 60 * 1000);
  const { error } = await db
    .from('search_queries')
    .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString() })
    .eq('id', queryId);
  if (error) throw error;
}

async function upsertCompany(db: Db, name: string, normalizedName: string): Promise<string> {
  const { data, error } = await db
    .from('companies')
    .upsert({ name, normalized_name: normalizedName }, { onConflict: 'normalized_name' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function findJobId(db: Db, job: NormalizedJob, companyId: string): Promise<string | null> {
  const { data: exact, error } = await db.from('jobs').select('id').eq('fingerprint', job.fingerprint).maybeSingle();
  if (error) throw error;
  if (exact) return exact.id;
  const { data: similar, error: rpcError } = await db.rpc('find_similar_job', {
    p_company_id: companyId,
    p_title: job.title,
  });
  if (rpcError) throw rpcError;
  return similar ?? null;
}

export async function saveJob(
  db: Db,
  sourceId: string,
  job: NormalizedJob,
  now: Date,
): Promise<{ jobId: string; isNew: boolean }> {
  const nowIso = now.toISOString();
  const { data: posting, error: postingError } = await db
    .from('job_postings')
    .select('job_id')
    .eq('source_id', sourceId)
    .eq('external_id', job.externalId)
    .maybeSingle();
  if (postingError) throw postingError;

  let jobId = posting?.job_id ?? null;
  let isNew = false;
  if (!jobId) {
    const companyId = await upsertCompany(db, job.company, job.companyNormalized);
    jobId = await findJobId(db, job, companyId);
    if (!jobId) {
      const { data, error } = await db
        .from('jobs')
        .insert({
          fingerprint: job.fingerprint,
          title: job.title,
          company_id: companyId,
          description_text: job.descriptionText,
          location: job.location,
          remote_type: job.remoteType,
          seniority: job.seniority,
          salary_raw: job.salaryRaw,
          salary_min_usd: job.salaryMinUsd,
          salary_max_usd: job.salaryMaxUsd,
          tags: job.tags,
          posted_at: job.postedAt?.toISOString() ?? null,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        })
        .select('id')
        .single();
      if (error?.code === '23505') {
        jobId = await findJobId(db, job, companyId);
        if (!jobId) throw error;
      } else if (error) {
        throw error;
      } else {
        jobId = data.id;
        isNew = true;
      }
    }
  }

  if (!isNew) {
    const { error } = await db.from('jobs').update({ last_seen_at: nowIso, status: 'active' }).eq('id', jobId);
    if (error) throw error;
  }
  const { error: upsertError } = await db
    .from('job_postings')
    .upsert(
      { job_id: jobId, source_id: sourceId, external_id: job.externalId, url: job.url, seen_at: nowIso },
      { onConflict: 'source_id,external_id' },
    );
  if (upsertError) throw upsertError;
  return { jobId, isNew };
}

export async function getActiveProfiles(db: Db): Promise<SearchProfile[]> {
  const { data, error } = await db.from('search_profiles').select(PROFILE_COLUMNS).eq('is_active', true);
  if (error) throw error;
  return data.map(toSearchProfile);
}

export async function getProfile(db: Db, id: string): Promise<(SearchProfile & { isActive: boolean }) | null> {
  const { data, error } = await db.from('search_profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { ...toSearchProfile(data), isActive: data.is_active } : null;
}

export async function getProfilesForQuery(db: Db, queryId: string): Promise<SearchProfile[]> {
  const { data, error } = await db
    .from('search_profile_queries')
    .select(`search_profiles!inner(${PROFILE_COLUMNS})`)
    .eq('search_query_id', queryId)
    .eq('search_profiles.is_active', true);
  if (error) throw error;
  return data.map((row) => toSearchProfile(row.search_profiles as ProfileRow));
}

export async function getDueQueryIds(db: Db, now: Date, limit = 300): Promise<{ id: string; sourceId: string }[]> {
  const { data, error } = await db
    .from('search_queries')
    .select('id, source_id, search_profile_queries!inner(search_profile_id)')
    .lte('next_run_at', now.toISOString())
    .order('next_run_at')
    .limit(limit);
  if (error) throw error;
  return data.map((q) => ({ id: q.id, sourceId: q.source_id }));
}

export async function getRecentJobs(db: Db, since: Date): Promise<{ jobId: string; job: ScorableJob }[]> {
  const { data, error } = await db
    .from('jobs')
    .select('id, title, description_text, tags, remote_type, seniority, location, salary_min_usd, salary_max_usd, skills')
    .eq('status', 'active')
    .gte('first_seen_at', since.toISOString())
    .limit(3000);
  if (error) throw error;
  return data.map((j) => ({
    jobId: j.id,
    job: {
      title: j.title,
      descriptionText: j.description_text,
      tags: j.tags,
      remoteType: (['remote', 'hybrid', 'office'] as const).find((r) => r === j.remote_type) ?? 'unknown',
      seniority: (SENIORITIES as readonly string[]).includes(j.seniority ?? '') ? (j.seniority as Seniority) : null,
      location: j.location,
      salaryMinUsd: j.salary_min_usd,
      salaryMaxUsd: j.salary_max_usd,
      skills: j.skills,
    },
  }));
}

export type MatchRow = {
  user_id: string;
  job_id: string;
  search_profile_id: string;
  score: number;
  breakdown: NonNullable<Json>;
  state: 'new' | 'hidden';
};

export async function insertMatches(db: Db, rows: MatchRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from('job_matches')
      .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,job_id', ignoreDuplicates: true });
    if (error) throw error;
  }
}
