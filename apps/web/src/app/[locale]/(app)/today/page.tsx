import { candidateEnglish, detectDomains, hideSuggestions, detectPerks, isLocale, localized, type LocalizedText, normalizeCompany, normalizeTitle, payLevelOf, requiredEnglish, requiredYears, SENIORITIES, type Seniority, sourceInfo } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { parseUiPrefs } from '@/lib/ui-prefs';
import { cardSkills, matchedSkillsOf } from './card-skills';
import { HideTips } from './hide-tips';
import { FeedStats } from './feed-stats';
import { SkillAnswers, SkillTipBanner } from './skill-answers';
import { missingSkillTip } from './skill-tips';
import { Feed } from './feed';
import { mergeMatches } from './feed-filter';
import { SearchNow } from './search-now';
import { getSearchNowStatus } from './search-now-actions';
import type { FeedMatch } from './feed-types';

const REMOTE = ['remote', 'hybrid', 'office'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ISO time `days` days ago. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function since24h(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

/** Postings older than this are not shown in Today, however recent the match. */
function windowStart(): string {
  return new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const userId = await requireUserId();
  const { match, view, fresh, kit } = await searchParams;
  // ?match=<id> (the Telegram "Open" button) focuses that match when it is in the feed.
  const focusId = typeof match === 'string' && UUID.test(match) ? match : null;
  const t = await getTranslations('today');
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const supabase = await createClient();
  const since = windowStart();
  const baseQuery = (states: ('new' | 'seen' | 'hidden')[] = ['new', 'seen']) =>
    supabase
      .from('job_matches')
      .select(
        'id, job_id, score, created_at, breakdown, explanation, search_profile_id, jobs!inner(title, location, remote_type, seniority, salary_min_usd, salary_max_usd, posted_at, first_seen_at, refreshed_at, summary, skills, description_text, tags, is_job, company_is_placeholder, companies(name), job_postings(source_id, url))',
      )
      .in('state', states)
      .eq('jobs.status', 'active')
      .not('jobs.is_job', 'is', false)
      // Every match not acted on yet, while its job is still listed on a board (seen in the last few days):
      // a bumped vacancy first published weeks ago, or a match from last week that was never opened, still shows.
      .gte('jobs.last_seen_at', since);
  const cutoff = since24h();
  const [{ data: bestRows }, { data: freshRows, error: freshError }, { data: profiles }, { data: me }, searchStatus, cv, { data: apps }] = await Promise.all([
    baseQuery().order('score', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    // Fresh jobs can score below the top 200, so fetch them separately for the "New in 24h" filter and "Newest" sort.
    // Same rule as the client filter: posted within 24h, or no posted_at and first seen within 24h.
    baseQuery()
      .or(`posted_at.gte.${cutoff},and(posted_at.is.null,first_seen_at.gte.${cutoff})`, { referencedTable: 'jobs' })
      .order('jobs(first_seen_at)', { ascending: false })
      .limit(200),
    supabase.from('search_profiles').select('id, name, skills, exclude_keywords, hide_other_stacks, is_active').order('created_at'),
    supabase.from('profiles').select('onboarded_at, ui_prefs').eq('id', userId).maybeSingle(),
    getSearchNowStatus(),
    loadPrimaryCv(supabase),
    supabase.from('applications').select('job_id, title, company, source_id, applied_at, first_response_at, outcome, board_columns(key, title)'),
  ]);
  // What the profile rules hid (level, role, format, region, exclude word): shown on demand so nothing is lost silently.
  const { data: ruleHiddenRows } = await baseQuery(['hidden'])
    .not('breakdown->>excludedBy', 'is', null)
    .order('score', { ascending: false })
    .limit(150);

  // Jobs the user hid by hand over the last 30 days: what they keep hiding becomes a one-click rule.
  const search = (profiles ?? []).at(-1);
  const { data: handHidden } = search
    ? await supabase
        .from('job_matches')
        .select('jobs(title)')
        .eq('state', 'hidden')
        .is('breakdown->>excludedBy', null)
        .gte('updated_at', daysAgo(30))
        .limit(500)
    : { data: [] };
  const tips = search
    ? hideSuggestions(
        (handHidden ?? []).map((r) => r.jobs?.title ?? '').filter(Boolean),
        { skills: search.skills, excludeKeywords: search.exclude_keywords, hideOtherStacks: search.hide_other_stacks },
      )
    : [];

  if (freshError) console.error('today: fresh matches query failed', { code: freshError.code, message: freshError.message });

  const profileSkills = new Map((profiles ?? []).map((p) => [p.id, p.skills]));
  // Jobs already on the board: by job id, or by company + title (the same vacancy found on another board or added by hand).
  const nameKey = (company: string, title: string) => `${normalizeCompany(company)}|${normalizeTitle(title)}`;
  const boardByJob = new Map<string, string>();
  const boardByName = new Map<string, string>();
  // Which platforms each vacancy was already applied on (or saved from): the same job on another board is still worth applying.
  const sourcesByJob = new Map<string, Set<string | null>>();
  const sourcesByName = new Map<string, Set<string | null>>();
  const addSource = (map: Map<string, Set<string | null>>, key: string, source: string | null) => map.set(key, (map.get(key) ?? new Set()).add(source));
  // Other vacancies of the same company already on the board: applying twice to one company is worth knowing.
  const boardByCompany = new Map<string, { title: string; column: string; sourceId: string | null }>();
  for (const a of apps ?? []) {
    const column = a.board_columns ? localized(a.board_columns.title as LocalizedText, locale) || a.board_columns.key : '';
    if (a.job_id) {
      boardByJob.set(a.job_id, column);
      addSource(sourcesByJob, a.job_id, a.source_id);
    }
    if (a.company && a.title) {
      boardByName.set(nameKey(a.company, a.title), column);
      addSource(sourcesByName, nameKey(a.company, a.title), a.source_id);
    }
    const company = a.company ? normalizeCompany(a.company) : '';
    if (company && a.title && !boardByCompany.has(company)) boardByCompany.set(company, { title: a.title, column, sourceId: a.source_id });
  }
  const myEnglish = cv?.parsed ? candidateEnglish(cv.parsed.languages) : null;
  /** The job's platforms that have no card yet; a card without a platform covers a job posted on one platform only. */
  const platformsLeft = (m: NonNullable<typeof bestRows>[number]): string[] => {
    const sources = [...new Set(m.jobs.job_postings.map((p) => p.source_id))];
    const onBoard = new Set([...(sourcesByJob.get(m.job_id) ?? []), ...(sourcesByName.get(nameKey(m.jobs.companies?.name ?? '', m.jobs.title)) ?? [])]);
    if (onBoard.has(null) && sourcesByJob.has(m.job_id) && sources.length === 1) return [];
    return sources.filter((s) => !onBoard.has(s));
  };
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
      // Loaded when the detail opens: shipping every description made the feed page ~1 MB.
      description: '',
      requiredYears: requiredYears(m.jobs.description_text, m.jobs.tags ?? []),
      candidateYears: cv?.parsed?.yearsExperience ?? null,
      requiredEnglish: requiredEnglish(m.jobs.description_text, m.jobs.tags ?? []),
      payLevel: payLevelOf(m.jobs.tags),
      candidateEnglish: myEnglish,
      onBoard: boardByJob.get(m.job_id) ?? boardByName.get(nameKey(m.jobs.companies?.name ?? '', m.jobs.title)) ?? null,
      onBoardLeft: platformsLeft(m),
      companyOnBoard: m.jobs.company_is_placeholder ? null : (boardByCompany.get(normalizeCompany(m.jobs.companies?.name ?? '')) ?? null),
      skills: cardSkills(m.jobs.skills, matched, 8, wanted),
      techs: cardSkills(m.jobs.skills, matched, 60, wanted),
      perks: detectPerks({ title: m.jobs.title, descriptionText: m.jobs.description_text }),
      domains: detectDomains({ title: m.jobs.title, company: m.jobs.companies?.name ?? null, descriptionText: m.jobs.description_text }),
      excludedBy: typeof (m.breakdown as { excludedBy?: unknown } | null)?.excludedBy === 'string' ? ((m.breakdown as { excludedBy: string }).excludedBy) : null,
      breakdown: b ? { skills: num(b.skills), role: num(b.role), seniority: num(b.seniority), location: num(b.location), salary: num(b.salary) } : null,
      profileId: m.search_profile_id,
      createdAt: m.created_at,
      // Older rows may hold a zone-shifted stamp in the future; never show "in 2 hours".
      postedAt: m.jobs.posted_at && m.jobs.posted_at > new Date().toISOString() ? new Date().toISOString() : m.jobs.posted_at,
      firstSeenAt: m.jobs.first_seen_at,
      refreshedAt: m.jobs.refreshed_at,
      postings: m.jobs.job_postings.map((p) => ({ sourceId: p.source_id, url: p.url })),
    };
  };
  // A job on the board on every platform it is posted on lives there; one still open on another platform stays to apply there too.
  const matches = mergeMatches((bestRows ?? []).map(toMatch), (freshRows ?? []).map(toMatch)).filter((m) => m.onBoard === null || m.onBoardLeft.length > 0);
  const sourceIds = [...new Set(matches.flatMap((m) => m.postings.map((p) => p.sourceId)))];

  // Four numbers over the feed: what is worth applying to today, and how the applications are doing.
  const nowMs = Date.now();
  const DAY = 86_400_000;
  const stats = {
    strong: matches.filter((m) => m.score >= 80 && Date.parse(m.firstSeenAt) > nowMs - DAY).length,
    saved: (apps ?? []).filter((a) => a.outcome === 'open' && !a.applied_at).length,
    silent: (apps ?? []).filter((a) => a.outcome === 'open' && a.applied_at && !a.first_response_at && Date.parse(a.applied_at) < nowMs - 14 * DAY).length,
    week: (apps ?? []).filter((a) => a.applied_at && Date.parse(a.applied_at) > nowMs - 7 * DAY).length,
  };
  // The technology the feed asks for most that the profile lacks: answering once sharpens every score.
  const skillTip = missingSkillTip(matches, parseUiPrefs(me?.ui_prefs).skillsDeclined ?? []);

  return (
    // Phone: a compact header, so the first jobs show on the first screen.
    <section className="flex flex-col gap-4 md:gap-6">
      {/* Title and the search toolbar share one row: the jobs start right under it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Two-tone title: the page, then what is waiting on it. */}
        <h1 className="text-3xl md:text-4xl">
          {t('title')}
          {matches.length > 0 && <span className="text-muted-foreground">. {t('titleCount', { count: matches.length })}</span>}
        </h1>
        {(profiles ?? []).length > 0 && <SearchNow initialStatus={searchStatus} autopilot={(profiles ?? []).some((p) => p.is_active)} />}
      </div>
      {me && !me.onboarded_at && (
        <Link href="/onboarding" data-testid="onboarding-banner" className="brutal brutal-press flex items-center justify-between gap-3 p-4 font-medium">
          <span className="flex items-center gap-3">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-ai" />
            {t('onboardingBanner')}
          </span>
          <span aria-hidden className="text-ai">→</span>
        </Link>
      )}
      {matches.length + (apps ?? []).length > 0 && <FeedStats {...stats} />}
      <SkillAnswers declined={parseUiPrefs(me?.ui_prefs).skillsDeclined ?? []}>
      {tips.length > 0 && <HideTips tips={tips} dismissed={parseUiPrefs(me?.ui_prefs).hideTipsDismissed ?? []} />}
      {skillTip && <SkillTipBanner skill={skillTip.skill} count={skillTip.count} />}
      <Feed
        matches={matches}
        focusId={focusId && matches.some((m) => m.id === focusId) ? focusId : null}
        profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.name }))}
        sources={sourceIds.map((id) => ({ id, name: sourceInfo(id)?.name ?? id }))}
        savedFilters={parseUiPrefs(me?.ui_prefs).feed}
        ruleHidden={(ruleHiddenRows ?? []).map(toMatch)}
        savedLabels={parseUiPrefs(me?.ui_prefs).cardLabels}
        // Offer Genie links: ?view=hidden opens "Hidden by rules", ?fresh=1 shows the last 24 h.
        openHidden={view === 'hidden'}
        onlyFresh={fresh === '1'}
        // Telegram "Apply kit" button: the focused job opens with its apply kit expanded.
        openKit={kit === '1'}
        userId={userId}
      />
      </SkillAnswers>
    </section>
  );
}
