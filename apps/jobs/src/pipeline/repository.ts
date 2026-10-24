import {
  type NormalizedJob,
  type ScorableJob,
  SEARCH_PROFILE_COLUMNS as PROFILE_COLUMNS,
  type SearchProfile,
  type SearchProfileRow as ProfileRow,
  SENIORITIES,
  type Seniority,
  SOURCE_IDS,
  type SourceId,
  toSearchProfile,
} from '@jp/core';
import type { Json } from '@jp/db';
import type { Db } from '../db';

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

export const BLOCKED_PAUSE_MS = 6 * 60 * 60 * 1000;

export async function updateSourceHealth(
  db: Db,
  source: SourceRow,
  outcome: 'ok' | 'empty' | 'blocked',
  now: Date,
): Promise<{ alert: string | null }> {
  if (outcome === 'blocked') {
    // Blocks (403/captcha) rarely lift within the hour; a long pause stops paying for doomed runs.
    const until = new Date(now.getTime() + BLOCKED_PAUSE_MS).toISOString();
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

/** New-job counts of a query's latest successful runs, newest first. */
export async function recentInserted(db: Db, queryId: string, limit: number): Promise<number[]> {
  const { data, error } = await db
    .from('source_runs')
    .select('inserted')
    .eq('query_id', queryId)
    .eq('status', 'ok')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((r) => r.inserted ?? 0);
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
const BACKFILL_COLUMNS = 'id, description_text, salary_raw, salary_min_usd, salary_max_usd, location, remote_type, remote_regions, tags, posted_at, refreshed_at';
type BackfillRow = {
  description_text: string | null;
  salary_min_usd: number | null;
  salary_max_usd: number | null;
  location: string | null;
  remote_type: string;
  remote_regions: string[] | null;
  tags: string[] | null;
  posted_at: string | null;
  refreshed_at: string | null;
};

/** A board date this many days after the first one is a re-publication (a bump), not the same posting. */
const REFRESH_AFTER_DAYS = 2;

async function backfillPatch(db: Db, jobId: string, job: NormalizedJob) {
  const { data, error } = await db.from('jobs').select(BACKFILL_COLUMNS).eq('id', jobId).single();
  if (error) throw error;
  return patchFrom(data, job);
}

/** What a newly seen posting adds to the stored job; empty when it brings nothing new. */
function patchFrom(data: BackfillRow, job: NormalizedJob) {
  const patch: {
    description_text?: string;
    salary_raw?: string | null;
    salary_min_usd?: number | null;
    salary_max_usd?: number | null;
    location?: string;
    remote_type?: string;
    remote_regions?: string[];
    tags?: string[];
    refreshed_at?: string;
  } = {};
  // The board shows the job again with a later date (Djinni's "updated"): remember the newest such date.
  if (job.postedAt && data.posted_at) {
    const board = job.postedAt.getTime();
    const later = board - Date.parse(data.posted_at) > REFRESH_AFTER_DAYS * 86_400_000;
    if (later && board <= Date.now() + 3_600_000 && (!data.refreshed_at || board > Date.parse(data.refreshed_at))) patch.refreshed_at = job.postedAt.toISOString();
  }
  // The board stated the format (e.g. Djinni's card label): it replaces a format guessed from the text.
  // Only towards remote (or over unknown), so two boards that disagree cannot flip it back and forth.
  if (job.remoteFromBoard && job.remoteType !== data.remote_type && (job.remoteType === 'remote' || data.remote_type === 'unknown')) {
    patch.remote_type = job.remoteType;
  }
  if (job.descriptionText.length > (data.description_text ?? '').length) patch.description_text = job.descriptionText;
  const hasSalary = data.salary_min_usd != null || data.salary_max_usd != null;
  if (!hasSalary && (job.salaryMinUsd != null || job.salaryMaxUsd != null)) {
    patch.salary_raw = job.salaryRaw;
    patch.salary_min_usd = job.salaryMinUsd;
    patch.salary_max_usd = job.salaryMaxUsd;
  }
  if (data.location == null && job.location) patch.location = job.location;
  // Board-stated regions are merged with the stored ones (the stored ones may come from another board).
  const regions = [...new Set([...(data.remote_regions ?? []), ...job.remoteRegions])];
  if (regions.length > (data.remote_regions ?? []).length) patch.remote_regions = regions;
  // Board facts carried as tags (e.g. Djinni's English level) reach jobs stored before the board showed them.
  const tags = [...new Set([...(data.tags ?? []), ...job.tags])];
  if (tags.length > (data.tags ?? []).length) patch.tags = tags;
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

const ID_CHUNK = 200;

/** External ids of this board's postings that are already stored. */
export async function knownExternalIds(db: Db, sourceId: string, externalIds: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (let i = 0; i < externalIds.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from('job_postings')
      .select('external_id')
      .eq('source_id', sourceId)
      .in('external_id', externalIds.slice(i, i + ID_CHUNK));
    if (error) throw error;
    for (const row of data) known.add(row.external_id);
  }
  return known;
}

/**
 * saveJob for a whole listing, with the same outcome but a handful of queries: most postings of a run are already
 * stored and unchanged, and saving them one by one (four round trips each) was most of a run's time and cost.
 * New postings and those that bring new facts (a description, salary, format, tags) still go through the full path.
 */
export async function saveJobs(db: Db, sourceId: string, jobs: NormalizedJob[], now: Date): Promise<{ jobId: string; isNew: boolean }[]> {
  const nowIso = now.toISOString();
  const unique = [...new Map(jobs.map((j) => [j.externalId, j])).values()];
  const stored = new Map<string, string>();
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from('job_postings')
      .select('external_id, job_id')
      .eq('source_id', sourceId)
      .in('external_id', unique.slice(i, i + ID_CHUNK).map((j) => j.externalId));
    if (error) throw error;
    for (const row of data) stored.set(row.external_id, row.job_id);
  }

  const results = new Map<string, { jobId: string; isNew: boolean }>();
  for (const job of unique) {
    if (!stored.has(job.externalId)) results.set(job.externalId, await saveJob(db, sourceId, job, now));
  }

  const known = unique.filter((j) => stored.has(j.externalId));
  if (known.length > 0) {
    const ids = [...new Set(known.map((j) => stored.get(j.externalId)!))];
    const rows = new Map<string, BackfillRow>();
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { data, error } = await db.from('jobs').select(BACKFILL_COLUMNS).in('id', ids.slice(i, i + ID_CHUNK));
      if (error) throw error;
      for (const row of data) rows.set(row.id, row);
    }
    const plain = new Set(ids);
    for (const job of known) {
      const jobId = stored.get(job.externalId)!;
      const row = rows.get(jobId);
      const patch = row ? patchFrom(row, job) : {};
      if (Object.keys(patch).length > 0) {
        const { error } = await db.from('jobs').update({ last_seen_at: nowIso, status: 'active', ...patch }).eq('id', jobId);
        if (error) throw error;
        plain.delete(jobId);
        // A later posting of the same job compares against what was just written.
        if (row) rows.set(jobId, { ...row, ...patch } as BackfillRow);
      }
      results.set(job.externalId, { jobId, isNew: false });
    }
    const unchanged = [...plain];
    for (let i = 0; i < unchanged.length; i += ID_CHUNK) {
      const { error } = await db.from('jobs').update({ last_seen_at: nowIso, status: 'active' }).in('id', unchanged.slice(i, i + ID_CHUNK));
      if (error) throw error;
    }
    for (let i = 0; i < known.length; i += ID_CHUNK) {
      const { error } = await db.from('job_postings').upsert(
        known.slice(i, i + ID_CHUNK).map((j) => ({ job_id: stored.get(j.externalId)!, source_id: sourceId, external_id: j.externalId, url: j.url, seen_at: nowIso })),
        { onConflict: 'source_id,external_id' },
      );
      if (error) throw error;
    }
  }
  return jobs.map((j) => results.get(j.externalId)!);
}

/** PostgREST caps a response at 1000 rows by default; bulk reads page through instead of silently truncating. */
const PAGE = 1000;

export async function getActiveProfiles(db: Db): Promise<SearchProfile[]> {
  const out: SearchProfile[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('search_profiles').select(PROFILE_COLUMNS).eq('is_active', true).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data.map(toSearchProfile));
    if (data.length < PAGE) return out;
  }
}

export async function getActiveProfilesOfUser(db: Db, userId: string): Promise<SearchProfile[]> {
  const { data, error } = await db.from('search_profiles').select(PROFILE_COLUMNS).eq('user_id', userId).eq('is_active', true);
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
  'id, title, description_text, tags, remote_type, seniority, location, salary_min_usd, salary_max_usd, skills, is_job, remote_regions, role';

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
  role: string | null;
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
    role: j.role,
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
