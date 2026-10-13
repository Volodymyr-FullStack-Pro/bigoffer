import { mainSkills } from '@jp/ai';
import { defaultSources, ROLE_FAMILIES, type RoleFamily, SEARCH_REMOTE_TYPES, targetRoleFamilies } from '@jp/core';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { skillKey } from '../today/card-skills';
import { SearchProfileForm, type SearchProfileValues } from './search-profile-form';
import { profileNameSuggestion } from './suggestions';

const EMPTY: SearchProfileValues = {
  name: '',
  keywords: [],
  targetRoles: [],
  skills: [],
  excludeKeywords: [],
  seniority: [],
  locations: [],
  remoteType: 'any',
  // The user picks the boards; "Use recommended" checks the main ones.
  sources: [],
  salaryMinUsd: null,
  isActive: true,
};

/** Skills the user's own matches ask for most, one spelling per technology, most frequent first. */
function mostAsked(skills: string[], max = 40): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const name of skills) {
    const k = skillKey(name);
    if (!k) continue;
    const c = counts.get(k) ?? { name, n: 0 };
    c.n += 1;
    counts.set(k, c);
  }
  return [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, max).map((c) => c.name);
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireUserId();
  const { new: addNew } = await searchParams;
  const t = await getTranslations('search');
  const supabase = await createClient();
  const [{ data }, cv, { data: matched }] = await Promise.all([
    supabase
      .from('search_profiles')
      .select('id, name, keywords, target_roles, skills, exclude_keywords, seniority, locations, remote_type, sources, salary_min_usd, is_active')
      .order('created_at'),
    loadPrimaryCv(supabase),
    supabase.from('job_matches').select('jobs!inner(skills)').in('state', ['new', 'seen', 'saved']).order('score', { ascending: false }).limit(300),
  ]);
  const demandSkills = mostAsked((matched ?? []).flatMap((m) => m.jobs.skills ?? []));
  // Skills the AI read from the CV are offered first in the skills field.
  // Not the stacks the CV names once in passing: suggesting PHP to a TypeScript developer adds noise.
  const cvSkills = cv?.parsed ? mainSkills(cv.parsed) : [];
  const cvHeadline = cv?.parsed?.headline ?? null;

  const profiles: SearchProfileValues[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    keywords: p.keywords,
    // No explicit choice yet: pre-check what the keywords imply, which is what matching already uses.
    targetRoles: targetRoleFamilies({
      targetRoles: p.target_roles.filter((r): r is RoleFamily => (ROLE_FAMILIES as readonly string[]).includes(r)),
      keywords: p.keywords,
    }),
    skills: p.skills,
    excludeKeywords: p.exclude_keywords,
    seniority: p.seniority,
    locations: p.locations,
    remoteType: p.remote_type,
    sources: p.sources ?? defaultSources(SEARCH_REMOTE_TYPES.find((r) => r === p.remote_type) ?? 'any'),
    salaryMinUsd: p.salary_min_usd,
    isActive: p.is_active,
  }));
  const showNew = profiles.length === 0 || addNew === '1';

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold md:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('intro')}</p>
      </div>
      {profiles.map((p) => (
        <SearchProfileForm key={p.id} values={p} cvSkills={cvSkills} cvHeadline={cvHeadline} demandSkills={demandSkills} />
      ))}
      {showNew ? (
        <SearchProfileForm values={{ ...EMPTY, name: profileNameSuggestion(cvHeadline, t('remote_any')) ?? t('newProfile') }} cvSkills={cvSkills} cvHeadline={cvHeadline} demandSkills={demandSkills} />
      ) : (
        <Link href="/search?new=1" className="brutal brutal-press self-start px-4 py-2 font-semibold" data-testid="search-add">
          + {t('add')}
        </Link>
      )}
    </section>
  );
}
