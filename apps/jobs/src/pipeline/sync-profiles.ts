import { buildSourceQueries, type SearchProfile } from '@jp/core';
import type { Db } from '../db';
import { matchJobs } from './match';
import { getActiveProfiles, getRecentJobs } from './repository';

const RECENT_DAYS = 7;

async function linkQueries(db: Db, profile: SearchProfile): Promise<string[]> {
  const specs = buildSourceQueries(profile);
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
    .in('query_key', specs.map((s) => s.queryKey));
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
    return { queryIds: [], matched: 0 };
  }
  const queryIds = await linkQueries(db, profile);
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 3600 * 1000);
  const matched = await matchJobs(db, [profile], await getRecentJobs(db, since));
  return { queryIds, matched };
}

export async function syncAllProfiles(db: Db, now: Date): Promise<number> {
  const profiles = await getActiveProfiles(db);
  for (const profile of profiles) await linkQueries(db, profile);
  return profiles.length;
}
