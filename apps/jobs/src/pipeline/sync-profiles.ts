import { type BoardRef, boardQuerySpecs, buildSourceQueries, defaultSources, type SearchProfile, scoreJob } from '@jp/core';
import type { Db } from '../db';
import { getEnabledBoards } from './boards';
import { matchJobs } from './match';
import { deleteNewMatches, getActiveProfiles, getNewMatchJobIdsOutsideSources, getRecentJobs } from './repository';

const RECENT_DAYS = 7;

async function linkQueries(db: Db, profile: SearchProfile, boards: BoardRef[]): Promise<string[]> {
  const specs = [
    ...buildSourceQueries(profile),
    ...boardQuerySpecs(boards, profile.sources ?? defaultSources(profile.remoteType)),
  ];
  const { error: upsertError } = await db
    .from('search_queries')
    .upsert(
      specs.map((s) => ({ source_id: s.sourceId, query_key: s.queryKey, params: s.params })),
      { onConflict: 'query_key', ignoreDuplicates: true },
    );
  if (upsertError) throw upsertError;

  const { data, error } = await db
    .from('search_queries')
    .select('id')
    // PostgREST list values containing commas/quotes (multi-param JSON keys) must be double-quoted and escaped;
    // supabase-js .in() quotes them without escaping inner quotes, so build the filter by hand.
    .filter('query_key', 'in', `(${specs.map((s) => `"${s.queryKey.replace(/[\\"]/g, '\\$&')}"`).join(',')})`);
  if (error) throw error;
  const ids = data.map((q) => q.id);

  const { error: deleteError } = await db
    .from('search_profile_queries')
    .delete()
    .eq('search_profile_id', profile.id)
    .not('search_query_id', 'in', `(${ids.join(',')})`);
  if (deleteError) throw deleteError;

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
  const queryIds = await linkQueries(db, profile, await getEnabledBoards(db));
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
  const { data: inactive, error } = await db.from('search_profiles').select('id').eq('is_active', false);
  if (error) throw error;
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
  const boards = await getEnabledBoards(db);
  for (const profile of profiles) await linkQueries(db, profile, boards);
  return profiles.length;
}
