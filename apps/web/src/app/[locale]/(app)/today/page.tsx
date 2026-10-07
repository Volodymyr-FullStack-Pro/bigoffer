import { isLocale, type LocalizedText, localized, SENIORITIES, type Seniority, sourceInfo } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { cardSkills, matchedSkillsOf } from './card-skills';
import { Feed } from './feed';
import { mergeMatches } from './feed-filter';
import type { FeedMatch } from './feed-types';

const REMOTE = ['remote', 'hybrid', 'office'] as const;

function since24h(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

function windowStart(): string {
  return new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
}

export default async function TodayPage() {
  const userId = await requireUserId();
  const t = await getTranslations('today');
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const supabase = await createClient();
  const since = windowStart();
  const baseQuery = () =>
    supabase
      .from('job_matches')
      .select(
        'id, job_id, score, created_at, breakdown, explanation, search_profile_id, jobs!inner(title, location, remote_type, seniority, salary_min_usd, salary_max_usd, posted_at, first_seen_at, summary, skills, description_text, is_job, companies(name), job_postings(source_id, url))',
      )
      .in('state', ['new', 'seen'])
      .eq('jobs.status', 'active')
      .not('jobs.is_job', 'is', false)
      .gte('created_at', since);
  const [{ data: bestRows }, { data: freshRows }, { data: profiles }, { data: me }] = await Promise.all([
    baseQuery().order('score', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    // Fresh jobs can score below the top 200, so fetch them separately for the "New in 24h" filter and "Newest" sort.
    baseQuery().gte('jobs.first_seen_at', since24h()).order('first_seen_at', { ascending: false, referencedTable: 'jobs' }).limit(200),
    supabase.from('search_profiles').select('id, name, skills').order('created_at'),
    supabase.from('profiles').select('onboarded_at').eq('id', userId).maybeSingle(),
  ]);

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
      location: m.jobs.location,
      remoteType: REMOTE.find((r) => r === m.jobs.remote_type) ?? 'unknown',
      seniority: (SENIORITIES as readonly string[]).includes(m.jobs.seniority ?? '') ? (m.jobs.seniority as Seniority) : null,
      salaryMinUsd: m.jobs.salary_min_usd,
      salaryMaxUsd: m.jobs.salary_max_usd,
      summary: localized(m.jobs.summary as LocalizedText | null, locale) || null,
      why: localized(m.explanation as LocalizedText | null, locale) || null,
      description: m.jobs.description_text.slice(0, 8000),
      skills: cardSkills(m.jobs.skills, matched, 8),
      missingSkills: wanted.filter((s) => !matched.some((x) => x.toLowerCase() === s.toLowerCase())),
      breakdown: b ? { skills: num(b.skills), role: num(b.role), seniority: num(b.seniority), location: num(b.location), salary: num(b.salary) } : null,
      profileId: m.search_profile_id,
      createdAt: m.created_at,
      postedAt: m.jobs.posted_at,
      firstSeenAt: m.jobs.first_seen_at,
      postings: m.jobs.job_postings.map((p) => ({ sourceId: p.source_id, url: p.url })),
    };
  };
  const matches = mergeMatches((bestRows ?? []).map(toMatch), (freshRows ?? []).map(toMatch));
  const sourceIds = [...new Set(matches.flatMap((m) => m.postings.map((p) => p.sourceId)))];

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
      {me && !me.onboarded_at && (
        <Link href="/onboarding" data-testid="onboarding-banner" className="brutal brutal-press flex items-center justify-between gap-3 bg-ai p-4 font-semibold text-white">
          {t('onboardingBanner')} →
        </Link>
      )}
      <Feed
        matches={matches}
        profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.name }))}
        sources={sourceIds.map((id) => ({ id, name: sourceInfo(id)?.name ?? id }))}
      />
    </section>
  );
}
