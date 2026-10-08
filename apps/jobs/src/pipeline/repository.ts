import {
  type NormalizedJob,
  type ScorableJob,
  type SearchProfile,
  SENIORITIES,
  SOURCE_IDS,
  type Seniority,
  type SourceId,
} from '@jp/core';
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
  sources: string[] | null;
  is_active?: boolean;
  profiles?: { country: string | null } | null;
};

const PROFILE_COLUMNS =
  'id, user_id, keywords, skills, exclude_keywords, seniority, locations, remote_type, salary_min_usd, sources, is_active, profiles(country)';

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
    sources: (() => {
      const valid = (row.sources ?? []).filter((s): s is SourceId => (SOURCE_IDS as readonly string[]).includes(s));
      return valid.length > 0 ? valid : null;
    })(),
    candidateCountry: row.profiles?.country ?? null,
  };
}

export async function getQuery(db: Db, id: string) {
  const { data, error } = await db
    .from('search_queries')
    .select('id, source_id, params, next_run_at')
    .eq('id', id)
    .maybeSingle();
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

/** Push a query's next run to a fixed time (e.g. when its source is paused). */
export async function deferQuery(db: Db, queryId: string, until: string) {
  const { error } = await db.from('search_queries').update({ next_run_at: until }).eq('id', queryId);
  if (error) throw error;
}

export async function markQueryRun(db: Db, queryId: string, now: Date, intervalMinutes: number, multiplier = 1) {
  const next = new Date(now.getTime() + Math.max(intervalMinutes, 15) * multiplier * 60 * 1000);
  const { error } = await db
    .from('search_queries')
    .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString() })
    .eq('id', queryId);
  if (error) throw error;
}

async function upsertCompany(db: Db, name: string, normalizedName: string): Promise<string> {
  // ON CONFLICT DO NOTHING keeps the first-seen display name; then read the id back.
  const { error: insertError } = await db
    .from('companies')
    .upsert({ name, normalized_name: normalizedName }, { onConflict: 'normalized_name', ignoreDuplicates: true });
  if (insertError) throw insertError;
  const { data, error } = await db.from('companies').select('id').eq('normalized_name', normalizedName).single();
  if (error) throw error;
  return data.id;
}

async function findJobId(db: Db, job: NormalizedJob, companyId: string): Promise<string | null> {
  const { data: exact, error } = await db.from('jobs').select('id').eq('fingerprint', job.fingerprint).maybeSingle();
  if (error) throw error;
  if (exact) return exact.id;
  // A placeholder company (e.g. "Djinni") groups unrelated employers: only the exact fingerprint may match.
  if (job.companyIsPlaceholder) return null;
  const { data: similar, error: rpcError } = await db.rpc('find_similar_job', {
    p_company_id: companyId,
    p_title: job.canonicalTitle,
  });
  if (rpcError) throw rpcError;
  return similar ?? null;
}

/**
 * Fields a richer posting of an already-stored job can fill in (e.g. a LinkedIn card without a description,
 * later seen on a board with the full text and a salary). Title and company stay as first seen.
 */
async function backfillPatch(db: Db, jobId: string, job: NormalizedJob) {
  const { data, error } = await db
    .from('jobs')
    .select('description_text, salary_raw, salary_min_usd, salary_max_usd, location, remote_regions')
    .eq('id', jobId)
    .single();
  if (error) throw error;
  const patch: {
    description_text?: string;
    salary_raw?: string | null;
    salary_min_usd?: number | null;
    salary_max_usd?: number | null;
    location?: string;
    remote_regions?: string[];
  } = {};
  if (job.descriptionText.length > (data.description_text ?? '').length) patch.description_text = job.descriptionText;
  const hasSalary = data.salary_min_usd != null || data.salary_max_usd != null;
  if (!hasSalary && (job.salaryMinUsd != null || job.salaryMaxUsd != null)) {
    patch.salary_raw = job.salaryRaw;
    patch.salary_min_usd = job.salaryMinUsd;
    patch.salary_max_usd = job.salaryMaxUsd;
  }
  if (data.location == null && job.location) patch.location = job.location;
  // Board-stated regions are merged with the stored ones (the stored ones may come from another board).
  if (job.remoteRegions.length > 0) patch.remote_regions = [...new Set([...(data.remote_regions ?? []), ...job.remoteRegions])];
  return patch;
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
          title_normalized: job.canonicalTitle,
          company_id: companyId,
          company_is_placeholder: job.companyIsPlaceholder,
          description_text: job.descriptionText,
          location: job.location,
          remote_type: job.remoteType,
          seniority: job.seniority,
          salary_raw: job.salaryRaw,
          salary_min_usd: job.salaryMinUsd,
          salary_max_usd: job.salaryMaxUsd,
          tags: job.tags,
          remote_regions: job.remoteRegions,
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
    const { error } = await db
      .from('jobs')
      .update({ last_seen_at: nowIso, status: 'active', ...(await backfillPatch(db, jobId, job)) })
      .eq('id', jobId);
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

/**
 * A query due within this window counts as due now: the hourly scheduler must not skip a query whose
 * next_run_at falls a few minutes after its tick. runQuery uses the same window to drop duplicate runs.
 */
export const DUE_WINDOW_MS = 10 * 60 * 1000;

export async function getDueQueryIds(
  db: Db,
  now: Date,
  limit = 300,
): Promise<{ id: string; sourceId: string; nextRunAt: string }[]> {
  const nowIso = now.toISOString();
  const dueBy = new Date(now.getTime() + DUE_WINDOW_MS).toISOString();
  // Only queries on enabled, unpaused sources that at least one active profile still uses;
  // otherwise skipped queries would sit at the head of the next_run_at order and starve the rest.
  const { data, error } = await db
    .from('search_queries')
    .select('id, source_id, next_run_at, sources!inner(id), search_profile_queries!inner(search_profiles!inner(id))')
    .lte('next_run_at', dueBy)
    .eq('sources.enabled', true)
    .or(`paused_until.is.null,paused_until.lte.${nowIso}`, { referencedTable: 'sources' })
    .eq('search_profile_queries.search_profiles.is_active', true)
    .order('next_run_at')
    .limit(limit);
  if (error) throw error;
  return data.map((q) => ({ id: q.id, sourceId: q.source_id, nextRunAt: q.next_run_at }));
}

const SCORABLE_COLUMNS =
  'id, title, description_text, tags, remote_type, seniority, location, salary_min_usd, salary_max_usd, skills, is_job, remote_regions';

type ScorableRow = {
  id: string;
  title: string;
  description_text: string;
  tags: string[];
  remote_type: string;
  seniority: string | null;
  location: string | null;
  salary_min_usd: number | null;
  salary_max_usd: number | null;
  skills: string[];
  is_job: boolean | null;
  remote_regions: string[];
};

function toScorableJob(j: ScorableRow): ScorableJob {
  return {
    title: j.title,
    descriptionText: j.description_text,
    tags: j.tags,
    remoteType: (['remote', 'hybrid', 'office'] as const).find((r) => r === j.remote_type) ?? 'unknown',
    seniority: (SENIORITIES as readonly string[]).includes(j.seniority ?? '') ? (j.seniority as Seniority) : null,
    location: j.location,
    salaryMinUsd: j.salary_min_usd,
    salaryMaxUsd: j.salary_max_usd,
    skills: j.skills,
    isJob: j.is_job,
    remoteRegions: j.remote_regions,
  };
}

/** Jobs as stored (incl. backfills and AI enrichment) with the sources they were seen on. */
export async function getScorableJobs(
  db: Db,
  jobIds: string[],
): Promise<{ jobId: string; job: ScorableJob; sources: SourceId[] }[]> {
  const out: { jobId: string; job: ScorableJob; sources: SourceId[] }[] = [];
  const unique = [...new Set(jobIds)];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db
      .from('jobs')
      .select(`${SCORABLE_COLUMNS}, job_postings(source_id)`)
      .in('id', unique.slice(i, i + 200));
    if (error) throw error;
    for (const j of data) {
      out.push({
        jobId: j.id,
        job: toScorableJob(j),
        sources: j.job_postings
          .map((p) => p.source_id)
          .filter((s): s is SourceId => (SOURCE_IDS as readonly string[]).includes(s)),
      });
    }
  }
  return out;
}

/** Active jobs first seen since `since` that have at least one posting on one of `sources`. */
export async function getRecentJobs(
  db: Db,
  since: Date,
  sources: readonly SourceId[],
): Promise<{ jobId: string; job: ScorableJob }[]> {
  if (sources.length === 0) return [];
  // The !inner embed + filter on it keeps only jobs with a posting on an enabled source; PostgREST nests the
  // matching postings as an array, so each job comes back once.
  const { data, error } = await db
    .from('jobs')
    .select(`${SCORABLE_COLUMNS}, job_postings!inner(source_id)`)
    .eq('status', 'active')
    .gte('first_seen_at', since.toISOString())
    .in('job_postings.source_id', [...sources])
    .order('first_seen_at', { ascending: false })
    .limit(3000);
  if (error) throw error;
  return data.map((j) => ({ jobId: j.id, job: toScorableJob(j) }));
}

/** Job ids of a profile's untouched ('new') matches whose job has no posting on any of `sources`. */
export async function getNewMatchJobIdsOutsideSources(
  db: Db,
  profileId: string,
  sources: readonly SourceId[],
): Promise<string[]> {
  const enabled = new Set<string>(sources);
  const out: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('job_matches')
      .select('job_id, jobs!inner(job_postings(source_id))')
      .eq('search_profile_id', profileId)
      .eq('state', 'new')
      .order('job_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const m of data) {
      if (!m.jobs.job_postings.some((p) => enabled.has(p.source_id))) out.push(m.job_id);
    }
    if (data.length < PAGE) return out;
  }
}

export type MatchRow = {
  user_id: string;
  job_id: string;
  search_profile_id: string;
  score: number;
  breakdown: NonNullable<Json>;
  state: 'new' | 'hidden';
};

/** Upserts via public.upsert_job_matches, which never overwrites a row the user acted on (seen/saved/hidden). */
export async function insertMatches(db: Db, rows: MatchRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.rpc('upsert_job_matches', { rows: rows.slice(i, i + 500) });
    if (error) throw error;
  }
}

/** Deletes a profile's untouched ('new') matches, optionally only for the given jobs. */
export async function deleteNewMatches(db: Db, profileId: string, jobIds?: string[]): Promise<void> {
  if (jobIds === undefined) {
    const { error } = await db.from('job_matches').delete().eq('search_profile_id', profileId).eq('state', 'new');
    if (error) throw error;
    return;
  }
  for (let i = 0; i < jobIds.length; i += 200) {
    const { error } = await db
      .from('job_matches')
      .delete()
      .eq('search_profile_id', profileId)
      .eq('state', 'new')
      .in('job_id', jobIds.slice(i, i + 200));
    if (error) throw error;
  }
}
