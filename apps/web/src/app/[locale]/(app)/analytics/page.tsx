import { sourceInfo } from '@jp/core';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { parseUiPrefs } from '@/lib/ui-prefs';
import { type AppRow, computeStats, whatWorks, type WorksGroup, WORKS_MIN } from './stats';

function Metric({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId: string }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-display text-3xl font-extrabold tracking-tight">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default async function AnalyticsPage() {
  const userId = await requireUserId();
  const t = await getTranslations('analytics');
  const tb = await getTranslations('board');
  const format = await getFormatter();
  const supabase = await createClient();
  const [{ data: apps }, { data: me }] = await Promise.all([
    supabase.from('applications').select('job_id, applied_at, first_response_at, outcome, source_id, rejection_reasons, letter_kind, board_columns(key), jobs(posted_at)'),
    supabase.from('profiles').select('timezone, ui_prefs').eq('id', userId).maybeSingle(),
  ]);
  const jobIds = (apps ?? []).map((a) => a.job_id).filter((id): id is string => Boolean(id));
  const { data: matches } = jobIds.length ? await supabase.from('job_matches').select('job_id, score').in('job_id', jobIds.slice(0, 500)) : { data: [] };
  const scoreByJob = new Map((matches ?? []).map((m) => [m.job_id, m.score]));
  const { data: tailored } = await supabase.from('tailored_cvs').select('job_id');
  const tailoredJobs = new Set((tailored ?? []).map((x) => x.job_id));
  const rows: AppRow[] = (apps ?? []).map((a) => ({
    column: a.board_columns?.key ?? 'saved',
    appliedAt: a.applied_at,
    firstResponseAt: a.first_response_at,
    outcome: a.outcome,
    sourceId: a.source_id,
    rejectionReasons: a.rejection_reasons ?? [],
    letterKind: a.letter_kind === 'full' || a.letter_kind === 'short' || a.letter_kind === 'none' ? a.letter_kind : null,
    postedAt: a.jobs?.posted_at ?? null,
    score: a.job_id ? (scoreByJob.get(a.job_id) ?? null) : null,
    tailoredCv: a.job_id ? tailoredJobs.has(a.job_id) : undefined,
  }));
  const works = whatWorks(rows);
  const worksGroups: [string, WorksGroup[]][] = [['letter', works.letter], ['cv', works.cv], ['speed', works.speed], ['score', works.score]];
  const goal = parseUiPrefs(me?.ui_prefs).genie?.goal ?? 5;
  const s = computeStats(rows, new Date(), me?.timezone ?? 'Europe/Kyiv');
  const peak = Math.max(goal, ...s.days.map((d) => d.count), 1);
  const funnel = [
    ['saved', s.funnel.saved],
    ['applied', s.funnel.applied],
    ['responded', s.funnel.responded],
    ['interview', s.funnel.interview],
    ['offer', s.funnel.offer],
  ] as const;

  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl md:text-4xl">{t('title')}</h1>
        <div data-testid="analytics-empty" className="flex max-w-xl flex-col gap-3 rounded-2xl border border-border bg-card p-6">
          <p className="text-lg">{t('empty')}</p>
          <Link href="/today" className="self-start rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">{t('toFeed')}</Link>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="analytics" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1 className="text-3xl md:text-4xl">{t('title')}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric testId="metric-week" label={t('appliedWeek')} value={String(s.applied7)} hint={t('appliedMonth', { count: s.applied30 })} />
        <Metric testId="metric-response" label={t('responseRate')} value={s.responseRate === null ? '—' : `${s.responseRate}%`} hint={t('responseHint')} />
        <Metric testId="metric-interviews" label={t('interviews')} value={String(s.interviews)} />
        <Metric testId="metric-offers" label={t('offers')} value={String(s.offers)} />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{t('daily')}</h2>
          <span className="text-xs text-muted-foreground">{t('goalLine', { goal })}</span>
        </div>
        <div className="relative flex h-40 items-end gap-1.5" data-testid="daily-chart">
          <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-brand/60" style={{ bottom: `${(goal / peak) * 100}%` }} />
          {s.days.map((d) => (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${d.count}`}>
              <span className="tabular-nums text-[10px] text-muted-foreground">{d.count > 0 ? d.count : ''}</span>
              <div className={`w-full rounded-t-md ${d.count >= goal ? 'bg-brand' : 'bg-brand/40'}`} style={{ height: `${(d.count / peak) * 100}%`, minHeight: d.count > 0 ? 4 : 2 }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between tabular-nums text-[10px] text-muted-foreground">
          <span>{format.dateTime(new Date(`${s.days[0]!.date}T12:00:00Z`), { day: 'numeric', month: 'short' })}</span>
          <span>{t('today')}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5" data-testid="funnel">
          <h2 className="text-base font-semibold">{t('funnel')}</h2>
          {funnel.map(([key, n]) => (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{t(`stage_${key}`)}</span>
                <span className="tabular-nums font-bold">{n}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${s.funnel.saved ? (n / s.funnel.saved) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{t('sources')}</h2>
            {s.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noData')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {s.sources.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2">
                    <span>{x.id === 'manual' ? t('manual') : (sourceInfo(x.id)?.name ?? x.id)}</span>
                    <span className="tabular-nums text-muted-foreground">{t('sourceLine', { applied: x.applied, responded: x.responded })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{t('reasons')}</h2>
            {s.reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noReasons')}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {s.reasons.map((r) => (
                  <li key={r.key} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                    {tb(`reason_${r.key}` as never)} · <span className="tabular-nums font-bold">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div data-testid="what-works" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold">{t('worksTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('worksHint', { min: WORKS_MIN })}</p>
        </div>
        {worksGroups.every(([, g]) => g.length === 0) ? (
          <p className="text-sm text-muted-foreground">{t('worksEmpty')}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {worksGroups.filter(([, g]) => g.length > 0).map(([dim, groups]) => {
              const best = Math.max(...groups.map((g) => g.responded / g.applied));
              return (
                <div key={dim} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t(`works_${dim}` as never)}</h3>
                  <ul className="flex flex-col gap-2">
                    {groups.map((g) => {
                      const rate = Math.round((100 * g.responded) / g.applied);
                      const top = groups.length > 1 && g.responded / g.applied === best && g.responded > 0;
                      return (
                        <li key={g.key} data-testid="works-row" data-dim={dim} data-key={g.key} className="flex flex-col gap-1">
                          <span className="flex justify-between gap-2 text-sm">
                            <span className={top ? 'font-semibold text-link' : ''}>{t(`works_${dim}_${g.key}` as never)}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {t('worksLine', { responded: g.responded, applied: g.applied })} · <b className={top ? 'text-link' : 'text-foreground'}>{rate}%</b>
                            </span>
                          </span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <span className={`block h-full rounded-full ${top ? 'bg-brand' : 'bg-foreground/40'}`} style={{ width: `${Math.max(rate, 3)}%` }} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
