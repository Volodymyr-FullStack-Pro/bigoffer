import { sourceInfo } from '@jp/core';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { parseUiPrefs } from '@/lib/ui-prefs';
import { type AppRow, computeStats } from './stats';

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
    supabase.from('applications').select('applied_at, first_response_at, outcome, source_id, rejection_reasons, board_columns(key)'),
    supabase.from('profiles').select('timezone, ui_prefs').eq('id', userId).maybeSingle(),
  ]);
  const rows: AppRow[] = (apps ?? []).map((a) => ({
    column: a.board_columns?.key ?? 'saved',
    appliedAt: a.applied_at,
    firstResponseAt: a.first_response_at,
    outcome: a.outcome,
    sourceId: a.source_id,
    rejectionReasons: a.rejection_reasons ?? [],
  }));
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
        <h1 className="text-3xl font-semibold md:text-4xl">{t('title')}</h1>
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
        <h1 className="text-3xl font-semibold md:text-4xl">{t('title')}</h1>
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
    </section>
  );
}
