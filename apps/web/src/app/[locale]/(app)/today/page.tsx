import { isLocale, type LocalizedText, localized, requiredYears, SENIORITIES, type Seniority, sourceInfo } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { parseUiPrefs } from '@/lib/ui-prefs';
import { cardSkills, matchedSkillsOf } from './card-skills';
import { Feed } from './feed';
import { mergeMatches } from './feed-filter';
import { SearchNow } from './search-now';
import { getSearchNowStatus } from './search-now-actions';
import type { FeedMatch } from './feed-types';

const REMOTE = ['remote', 'hybrid', 'office'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function since24h(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

function windowStart(): string {
  return new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const userId = await requireUserId();
  const { match } = await searchParams;
  // ?match=<id> (the Telegram "Open" button) focuses that match when it is in the feed.
  const focusId = typeof match === 'string' && UUID.test(match) ? match : null;
  const t = await getTranslations('today');
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const supabase = await createClient();
  const since = windowStart();
  const baseQuery = () =>
    supabase
      .from('job_matches')
      .select(
        'id, job_id, score, created_at, breakdown, explanation, search_profile_id, jobs!inner(title, location, remote_type, seniority, salary_min_usd, salary_max_usd, posted_at, first_seen_at, summary, skills, description_text, is_job, company_is_placeholder, companies(name), job_postings(source_id, url))',
      )
      .in('state', ['new', 'seen'])
      .eq('jobs.status', 'active')
      .not('jobs.is_job', 'is', false)
      .gte('created_at', since);
  const cutoff = since24h();
  const [{ data: bestRows }, { data: freshRows, error: freshError }, { data: profiles }, { data: me }, searchStatus, cv] = await Promise.all([
    baseQuery().order('score', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    // Fresh jobs can score below the top 200, so fetch them separately for the "New in 24h" filter and "Newest" sort.
    // Same rule as the client filter: posted within 24h, or no posted_at and first seen within 24h.
    baseQuery()
      .or(`posted_at.gte.${cutoff},and(posted_at.is.null,first_seen_at.gte.${cutoff})`, { referencedTable: 'jobs' })
      .order('jobs(first_seen_at)', { ascending: false })
      .limit(200),
    supabase.from('search_profiles').select('id, name, skills, is_active').order('created_at'),
    supabase.from('profiles').select('onboarded_at, ui_prefs').eq('id', userId).maybeSingle(),
    getSearchNowStatus(),
    loadPrimaryCv(supabase),
  ]);

  if (freshError) console.error('today: fresh matches query failed', { code: freshError.code, message: freshError.message });

  const profileSkills = new Map((profiles ?? []).map((p) => [p.id, p.skills]));
  const toMatch = (m: NonNullable<typeof bestRows>[number]): FeedMatch => {
    const matched = matchedSkillsOf(m.breakdown);
    const wanted = m.search_profile_id ? (profileSkills.get(m.search_profile_id) ?? []) : [];
    const b = m.breakdown as Partial<Record<'skills' | 'role' | 'seniority' | 'location' | 'salary', unknown>> | null;
    const num = (v: unknown) => (typeof v === 'number' ? v : 0);
    return {
      id: m.id,
      jobId: m.job_id,
      score: m.score,
      title: m.jobs.title,
      company: m.jobs.companies?.name ?? '',
      companyIsPlaceholder: m.jobs.company_is_placeholder,
      location: m.jobs.location,
      remoteType: REMOTE.find((r) => r === m.jobs.remote_type) ?? 'unknown',
      seniority: (SENIORITIES as readonly string[]).includes(m.jobs.seniority ?? '') ? (m.jobs.seniority as Seniority) : null,
      salaryMinUsd: m.jobs.salary_min_usd,
      salaryMaxUsd: m.jobs.salary_max_usd,
      summary: localized(m.jobs.summary as LocalizedText | null, locale) || null,
      why: localized(m.explanation as LocalizedText | null, locale) || null,
      description: m.jobs.description_text.slice(0, 8000),
      requiredYears: requiredYears(m.jobs.description_text),
      candidateYears: cv?.parsed?.yearsExperience ?? null,
      skills: cardSkills(m.jobs.skills, matched, 8),
      missingSkills: wanted.filter((s) => !matched.some((x) => x.toLowerCase() === s.toLowerCase())),
      breakdown: b ? { skills: num(b.skills), role: num(b.role), seniority: num(b.seniority), location: num(b.location), salary: num(b.salary) } : null,
      profileId: m.search_profile_id,
      createdAt: m.created_at,
      // Older rows may hold a zone-shifted stamp in the future; never show "in 2 hours".
      postedAt: m.jobs.posted_at && m.jobs.posted_at > new Date().toISOString() ? new Date().toISOString() : m.jobs.posted_at,
      firstSeenAt: m.jobs.first_seen_at,
      postings: m.jobs.job_postings.map((p) => ({ sourceId: p.source_id, url: p.url })),
    };
  };
  const matches = mergeMatches((bestRows ?? []).map(toMatch), (freshRows ?? []).map(toMatch));
  const sourceIds = [...new Set(matches.flatMap((m) => m.postings.map((p) => p.sourceId)))];

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold md:text-4xl">{t('title')}</h1>
      {me && !me.onboarded_at && (
        <Link href="/onboarding" data-testid="onboarding-banner" className="brutal brutal-press flex items-center justify-between gap-3 p-4 font-medium">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-ai" />
            {t('onboardingBanner')}
          </span>
          <span aria-hidden className="text-ai">→</span>
        </Link>
      )}
      {(profiles ?? []).length > 0 && <SearchNow initialStatus={searchStatus} autopilot={(profiles ?? []).some((p) => p.is_active)} />}
      <Feed
        matches={matches}
        focusId={focusId && matches.some((m) => m.id === focusId) ? focusId : null}
        profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.name }))}
        sources={sourceIds.map((id) => ({ id, name: sourceInfo(id)?.name ?? id }))}
        savedFilters={parseUiPrefs(me?.ui_prefs).feed}
      />
    </section>
  );
}
