import 'server-only';
import { type ParsedCv, searchProfileFromCv } from '@jp/ai';
import { detectRoleFamilies, MAIN_SOURCE_IDS, MAX_KEYWORDS } from '@jp/core';
import { recommendedKeywords } from '@/app/[locale]/(app)/search/suggestions';
import type { createClient } from '@/lib/supabase/server';
import { requestProfileSync } from '@/lib/trigger';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * A user has one search, and it follows their CV: a new CV replaces it. Choices that are not in a CV
 * (excluded words, boards, salary floor, work format) carry over; roles, keywords, skills and level come from the CV.
 */
export async function replaceSearchFromCv(supabase: Supabase, userId: string, cv: ParsedCv): Promise<string | null> {
  const { data: old } = await supabase
    .from('search_profiles')
    .select('id, exclude_keywords, sources, salary_min_usd, remote_type')
    .order('updated_at', { ascending: false });
  const keep = old?.[0];
  const p = searchProfileFromCv(cv);
  // The headline alone is one keyword: add the titles such a CV is hired under, and its role families.
  const roles = cv.headline ? detectRoleFamilies(cv.headline) : [];
  const keywords = [...new Set([...p.keywords, ...recommendedKeywords(cv.headline, roles, cv.skills, MAX_KEYWORDS)])].slice(0, 10);
  const { data, error } = await supabase
    .from('search_profiles')
    .insert({
      user_id: userId,
      name: p.name,
      keywords,
      target_roles: roles,
      skills: p.skills,
      seniority: p.seniority,
      locations: p.locations,
      remote_type: keep && keep.remote_type !== 'any' ? keep.remote_type : p.remoteType,
      exclude_keywords: keep?.exclude_keywords ?? [],
      sources: keep?.sources?.length ? keep.sources : [...MAIN_SOURCE_IDS],
      salary_min_usd: keep?.salary_min_usd ?? null,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('search from CV: insert failed', error?.code ?? 'unknown');
    return null;
  }
  // Only once the new search exists: the old ones go, with their unreviewed matches (a DB trigger).
  if (old?.length) {
    const { error: delError } = await supabase.from('search_profiles').delete().in('id', old.map((o) => o.id));
    if (delError) console.error('search from CV: could not drop the old search', delError.code ?? 'unknown');
  }
  await requestProfileSync(data.id);
  return data.id;
}

/** The CV is gone, so is the search built from it. */
export async function dropSearch(supabase: Supabase, userId: string): Promise<void> {
  const { error } = await supabase.from('search_profiles').delete().eq('user_id', userId);
  if (error) console.error('search: could not drop with the CV', error.code ?? 'unknown');
}
