import { radarFeedIds, radarFeedUrl } from '@jp/scrapers';
import type { Db } from '../db';
import { knownExternalIds } from './repository';

/** Boards with a cheap RSS feed per query; robota.ua has none, so it keeps its regular schedule. */
const RADAR_SOURCES = ['djinni', 'dou'];
/** Pause between two feeds of one sweep, to stay a polite reader. */
const GAP_MS = 300;
/** Feed items older than this are not news; the regular scrape has had its chances with them. */
const FRESH_MS = 2 * 24 * 3600_000;

export type RadarHit = { queryId: string; sourceId: string; fresh: string[] };
export type RadarResult = { checked: number; errors: number; hits: RadarHit[] };

/**
 * One sweep of the radar: every Djinni and DOU query an active search uses is read from its RSS feed, and a query
 * whose feed lists a posting we have not stored yet is returned, to be scraped at once.
 */
export async function radarSweep(db: Db, fetchText: (url: string) => Promise<string>): Promise<RadarResult> {
  const { data, error } = await db
    .from('search_queries')
    .select('id, source_id, params, sources!inner(id), search_profile_queries!inner(search_profiles!inner(id))')
    .in('source_id', RADAR_SOURCES)
    .eq('sources.enabled', true)
    .or(`paused_until.is.null,paused_until.lte.${new Date().toISOString()}`, { referencedTable: 'sources' })
    .eq('search_profile_queries.search_profiles.is_active', true);
  if (error) throw error;
  const result: RadarResult = { checked: 0, errors: 0, hits: [] };
  for (const q of data) {
    const url = radarFeedUrl(q.source_id, (q.params ?? {}) as Record<string, string>);
    if (!url) continue;
    result.checked++;
    try {
      const ids = radarFeedIds(q.source_id, await fetchText(url), new Date(Date.now() - FRESH_MS));
      const known = await knownExternalIds(db, q.source_id, ids);
      const fresh = ids.filter((id) => !known.has(id));
      if (fresh.length > 0) result.hits.push({ queryId: q.id, sourceId: q.source_id, fresh });
    } catch {
      // A feed that fails this time is read again in two minutes; the regular scrape still covers it.
      result.errors++;
    }
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  return result;
}
