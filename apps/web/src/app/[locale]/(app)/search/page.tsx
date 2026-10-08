import { defaultSources, SEARCH_REMOTE_TYPES } from '@jp/core';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SearchProfileForm, type SearchProfileValues } from './search-profile-form';

const EMPTY: SearchProfileValues = {
  name: '',
  keywords: [],
  skills: [],
  excludeKeywords: [],
  seniority: [],
  locations: [],
  remoteType: 'any',
  sources: defaultSources('any'),
  salaryMinUsd: null,
  isActive: true,
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireUserId();
  const { new: addNew } = await searchParams;
  const t = await getTranslations('search');
  const supabase = await createClient();
  const { data } = await supabase
    .from('search_profiles')
    .select('id, name, keywords, skills, exclude_keywords, seniority, locations, remote_type, sources, salary_min_usd, is_active')
    .order('created_at');

  const profiles: SearchProfileValues[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    keywords: p.keywords,
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
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('intro')}</p>
      </div>
      {profiles.map((p) => (
        <SearchProfileForm key={p.id} values={p} />
      ))}
      {showNew ? (
        <SearchProfileForm values={{ ...EMPTY, name: t('newProfile') }} />
      ) : (
        <Link href="/search?new=1" className="brutal brutal-press self-start px-4 py-2 font-semibold" data-testid="search-add">
          + {t('add')}
        </Link>
      )}
    </section>
  );
}
