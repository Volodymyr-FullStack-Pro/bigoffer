import { BOARD_SOURCE_IDS, type BoardRef, type SourceId } from '@jp/core';
import type { SourceAdapter } from '@jp/scrapers';
import type { Db } from '../db';
import type { RunQueryDeps } from './run-query';

const SLUG = /^[a-z0-9][a-z0-9_-]{2,60}$/;
const PATTERNS: [SourceId, RegExp][] = [
  ['greenhouse', /(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9_-]+)/gi],
  ['lever', /jobs\.lever\.co\/([a-z0-9_-]+)/gi],
  ['ashby', /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/gi],
  ['workable', /apply\.workable\.com\/([a-z0-9_-]+)/gi],
];
const MAX_CHECKS = 20;
const PAGE = 1000;
const MAX_SCANNED_JOBS = 5000;
const MAX_FAILURES = 3;
/** Discovery stops auto-enabling past this many enabled discovered boards; further ones wait for manual enabling. */
export const MAX_DISCOVERED_ENABLED = 100;

export async function getEnabledBoards(db: Db): Promise<BoardRef[]> {
  const { data, error } = await db.from('source_boards').select('source_id, slug, name').eq('enabled', true);
  if (error) throw error;
  return data
    .filter((b) => BOARD_SOURCE_IDS.has(b.source_id as SourceId))
    .map((b) => ({ sourceId: b.source_id as SourceId, slug: b.slug, ...(b.name ? { name: b.name } : {}) }));
}

export async function recordBoardRun(db: Db, sourceId: string, slug: string, ok: boolean): Promise<void> {
  if (ok) {
    const { error } = await db
      .from('source_boards')
      .update({ failures: 0, last_ok_at: new Date().toISOString() })
      .eq('source_id', sourceId)
      .eq('slug', slug);
    if (error) throw error;
    return;
  }
  const { data, error } = await db.from('source_boards').select('failures').eq('source_id', sourceId).eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const failures = data.failures + 1;
  const { error: updateError } = await db
    .from('source_boards')
    .update({ failures, enabled: failures < MAX_FAILURES })
    .eq('source_id', sourceId)
    .eq('slug', slug);
  if (updateError) throw updateError;
}

export async function discoverBoards(
  db: Db,
  deps: Pick<RunQueryDeps, 'adapters' | 'createContext'> & { now?: () => Date; maxEnabled?: number },
): Promise<{ checked: number; added: number }> {
  const since = new Date((deps.now?.() ?? new Date()).getTime() - 14 * 24 * 3600 * 1000).toISOString();
  // PostgREST caps a response at 1000 rows, so page through the newest jobs.
  const jobs: { description_text: string | null; job_postings: { url: string }[] }[] = [];
  for (let from = 0; from < MAX_SCANNED_JOBS; from += PAGE) {
    const { data, error } = await db
      .from('jobs')
      .select('description_text, job_postings(url)')
      .gte('first_seen_at', since)
      .order('first_seen_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    jobs.push(...data);
    if (data.length < PAGE) break;
  }
  const { data: known, error: knownError } = await db.from('source_boards').select('source_id, slug');
  if (knownError) throw knownError;
  const seen = new Set(known.map((b) => `${b.source_id}:${b.slug.toLowerCase()}`));
  const candidates = new Map<string, { sourceId: SourceId; slug: string }>();
  for (const j of jobs) {
    const text = `${j.description_text ?? ''} ${j.job_postings.map((p) => p.url).join(' ')}`;
    for (const [sourceId, re] of PATTERNS) {
      for (const m of text.matchAll(re)) {
        const slug = m[1]!.toLowerCase();
        const key = `${sourceId}:${slug}`;
        if (SLUG.test(slug) && !seen.has(key)) candidates.set(key, { sourceId, slug });
      }
    }
  }
  const maxEnabled = deps.maxEnabled ?? MAX_DISCOVERED_ENABLED;
  const { count: enabledCount, error: countError } = await db
    .from('source_boards')
    .select('slug', { count: 'exact', head: true })
    .eq('origin', 'discovered')
    .eq('enabled', true);
  if (countError) throw countError;
  let enabledDiscovered = enabledCount ?? 0;
  const verifiable = [...candidates.values()].filter((c) => deps.adapters[c.sourceId]);
  let checked = 0;
  let added = 0;
  for (const c of verifiable.slice(0, MAX_CHECKS)) {
    const adapter = deps.adapters[c.sourceId]!;
    checked += 1;
    const ctx = deps.createContext(c.sourceId);
    let ok = false;
    try {
      ok = (await adapter.search({ board: c.slug }, ctx)).length > 0;
    } catch {
      // not a real board, or the API refused: remembered below as a dead candidate
    } finally {
      await ctx.dispose?.().catch(() => undefined);
    }
    // A failed candidate is stored disabled so it counts as known and is not re-checked every night;
    // a verified one over the cap is stored disabled (no failures) for manual enabling.
    const enable = ok && enabledDiscovered < maxEnabled;
    const { error: insertError } = await db.from('source_boards').insert({
      source_id: c.sourceId,
      slug: c.slug,
      origin: 'discovered',
      ...(ok ? (enable ? {} : { enabled: false }) : { enabled: false, failures: MAX_FAILURES }),
    });
    if (!insertError && enable) {
      added += 1;
      enabledDiscovered += 1;
    }
  }
  return { checked, added };
}
