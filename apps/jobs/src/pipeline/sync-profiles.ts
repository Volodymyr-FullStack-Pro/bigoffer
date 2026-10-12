import { buildSourceQueries, defaultSources, type SearchProfile, scoreJob } from '@jp/core';
import type { Db } from '../db';
import { matchJobs } from './match';
import { deleteNewMatches, getActiveProfiles, getNewMatchJobIdsOutsideSources, getRecentJobs } from './repository';

const RECENT_DAYS = 7;
const CHUNK = 100;
// query_key values are long JSON strings that URL-encode ~3x; 100 of them overflow the PostgREST URI limit.
const KEY_CHUNK = 20;

async function linkQueries(db: Db, profile: SearchProfile): Promise<string[]> {
  const specs = buildSourceQueries(profile);
  const { error: upsertError } = await db
    .from('search_queries')
    .upsert(
      specs.map((s) => ({ source_id: s.sourceId, query_key: s.queryKey, params: s.params })),
      { onConflict: 'query_key', ignoreDuplicates: true },
    );
  if (upsertError) throw upsertError;

  const ids: string[] = [];
  for (let i = 0; i < specs.length; i += KEY_CHUNK) {
    const { data, error } = await db
      .from('search_queries')
      .select('id')
      // PostgREST list values containing commas/quotes (multi-param JSON keys) must be double-quoted and escaped;
      // supabase-js .in() quotes them without escaping inner quotes, so build the filter by hand.
      .filter('query_key', 'in', `(${specs.slice(i, i + KEY_CHUNK).map((s) => `"${s.queryKey.replace(/[\\"]/g, '\\$&')}"`).join(',')})`);
    if (error) throw error;
    ids.push(...data.map((q) => q.id));
  }

  // Prune links to queries the profile no longer has, in chunks so the URL stays short.
  const { data: linked, error: linkedError } = await db
    .from('search_profile_queries')
    .select('search_query_id')
    .eq('search_profile_id', profile.id);
  if (linkedError) throw linkedError;
  const keep = new Set(ids);
  const stale = linked.map((l) => l.search_query_id).filter((id) => !keep.has(id));
  for (let i = 0; i < stale.length; i += CHUNK) {
    const { error: deleteError } = await db
      .from('search_profile_queries')
      .delete()
      .eq('search_profile_id', profile.id)
      .in('search_query_id', stale.slice(i, i + CHUNK));
    if (deleteError) throw deleteError;
  }

  const { error: linkError } = await db
    .from('search_profile_queries')
    .upsert(
      ids.map((id) => ({ search_profile_id: profile.id, search_query_id: id })),
      { onConflict: 'search_profile_id,search_query_id', ignoreDuplicates: true },
    );
  if (linkError) throw linkError;
  return ids;
}

export async function syncProfile(
  db: Db,
  profile: SearchProfile & { isActive?: boolean },
  now: Date,
): Promise<{ queryIds: string[]; matched: number }> {
  if (profile.isActive === false) {
    const { error } = await db.from('search_profile_queries').delete().eq('search_profile_id', profile.id);
    if (error) throw error;
    await deleteNewMatches(db, profile.id);
    return { queryIds: [], matched: 0 };
  }
  const queryIds = await linkQueries(db, profile);
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 3600 * 1000);
  const sources = profile.sources ?? defaultSources(profile.remoteType);
  const recent = await getRecentJobs(db, since, sources);
  const matched = await matchJobs(db, [profile], recent);
  // After an edit, untouched matches that no longer fit this profile disappear: recent jobs it no longer scores,
  // and jobs seen only on boards the profile has turned off.
  const stale = recent.filter(({ job }) => scoreJob(profile, job) === null).map(({ jobId }) => jobId);
  stale.push(...(await getNewMatchJobIdsOutsideSources(db, profile.id, sources)));
  await deleteNewMatches(db, profile.id, stale);
  return { queryIds, matched };
}

export async function syncAllProfiles(db: Db, _now: Date): Promise<number> {
  // Paged: PostgREST returns at most 1000 rows per request.
  const inactive: { id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('search_profiles').select('id').eq('is_active', false).order('id').range(from, from + 999);
    if (error) throw error;
    inactive.push(...data);
    if (data.length < 1000) break;
  }
  for (let i = 0; i < inactive.length; i += 200) {
    const { error: unlinkError } = await db
      .from('search_profile_queries')
      .delete()
      .in(
        'search_profile_id',
        inactive.slice(i, i + 200).map((p) => p.id),
      );
    if (unlinkError) throw unlinkError;
  }
  const profiles = await getActiveProfiles(db);
  for (const profile of profiles) await linkQueries(db, profile);
  return profiles.length;
}
