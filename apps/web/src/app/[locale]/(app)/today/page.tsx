import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { JobMatchCard, type JobMatchView } from './job-match-card';

const REMOTE = ['remote', 'hybrid', 'office'] as const;

function windowStart(): string {
  return new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
}

export default async function TodayPage() {
  await requireUserId();
  const t = await getTranslations('today');
  const supabase = await createClient();
  const since = windowStart();
  const { data } = await supabase
    .from('job_matches')
    .select(
      'id, score, created_at, jobs!inner(title, location, remote_type, salary_min_usd, salary_max_usd, companies(name), job_postings(source_id, url))',
    )
    .in('state', ['new', 'seen'])
    .eq('jobs.status', 'active')
    .gte('created_at', since)
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  const matches: JobMatchView[] = (data ?? []).map((m) => ({
    id: m.id,
    score: m.score,
    title: m.jobs.title,
    company: m.jobs.companies?.name ?? '',
    location: m.jobs.location,
    remoteType: REMOTE.find((r) => r === m.jobs.remote_type) ?? 'unknown',
    salaryMinUsd: m.jobs.salary_min_usd,
    salaryMaxUsd: m.jobs.salary_max_usd,
    seenAt: m.created_at,
    postings: m.jobs.job_postings.map((p) => ({ sourceId: p.source_id, url: p.url })),
  }));

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
        {matches.length > 0 && <p className="mt-2 text-muted-foreground">{t('subtitle', { count: matches.length })}</p>}
      </div>
      {matches.length === 0 ? (
        <div data-testid="today-empty" className="brutal flex max-w-xl flex-col gap-4 p-6">
          <p className="text-lg">{t('empty')}</p>
          <Link href="/search" className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">
            {t('setup')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {matches.map((m) => (
            <JobMatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}
