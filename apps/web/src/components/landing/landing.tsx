import { sourceInfo } from '@jp/core';
import { AlarmClock, Bot, CalendarClock, CircleHelp } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { LegalLinks } from '@/components/legal-links';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { StatusBadge, type StatusTone, toneColor } from '@/components/ui/status-badge';
import { Link } from '@/i18n/navigation';
import type { LandingStats } from './stats';
import { WatchingB } from './watching-b';

const cta = 'btn brutal-press inline-flex items-center justify-center rounded-xl px-5 py-3 font-semibold';

/** One card of the demo board, drawn with the app's own badges; `note` is the hand-written comment beside it. */
function DemoCard({ title, company, tone, badge, score, note }: { title: string; company: string; tone?: StatusTone; badge?: ReactNode; score?: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="brutal flex flex-col gap-1.5 p-3" style={tone ? { borderLeftColor: toneColor(tone), borderLeftWidth: 3 } : undefined}>
        {badge}
        <span className="font-semibold leading-tight">{title}</span>
        <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          {company}
          {score !== undefined && <span className="font-semibold text-foreground tabular-nums">{score}%</span>}
        </span>
      </div>
      {note && <span className="pl-1 text-xs text-brand">↑ {note}</span>}
    </div>
  );
}

export async function Landing({ stats }: { stats: LandingStats | null }) {
  const t = await getTranslations('landing');
  const tApp = await getTranslations('app');
  const tTheme = await getTranslations('theme');
  const format = await getFormatter();
  const recent = (stats?.recent ?? []).slice(0, 8);

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label={tApp('name')}>
            <Logo name={tApp('name')} />
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <span className="hidden sm:block">
              <ThemeToggle labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }} />
            </span>
            <Link href="/login" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold sm:border-0 sm:px-2">{t('signIn')}</Link>
            <Link href="/login" data-testid="landing-start-top" className="btn brutal-press hidden rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground sm:inline-flex">{t('start')}</Link>
          </div>
        </div>
      </header>

      <main>
        {/* The brand watching: the b's eyes follow the pointer; the numbers live inside the sentence. */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-16 md:grid-cols-[minmax(0,1fr)_auto] md:pt-24 md:pb-24">
          <div className="max-w-2xl">
            <h1 className="text-5xl leading-[1.04] md:text-6xl">{t('heroTitle')}</h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl">
              {stats && stats.day > 0
                ? t.rich('heroLive', { day: stats.day, b: (c) => <b className="font-semibold text-foreground tabular-nums">{c}</b> })
                : t('heroOffline')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/login" data-testid="landing-start" className={`${cta} bg-brand text-brand-foreground`}>{t('start')}</Link>
              <span className="text-sm text-muted-foreground">{t('heroNote')}</span>
            </div>
          </div>
          <WatchingB className="mx-auto h-56 w-auto md:h-80" />
        </section>

        {/* What the radar saw a moment ago: real postings, newest first. */}
        <section className="border-y border-border bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:py-20">
            <div>
              <h2 className="flex items-center gap-2.5 text-3xl md:text-4xl">
                <span aria-hidden className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
                </span>
                {t('logTitle')}
              </h2>
              <p className="mt-4 text-muted-foreground">{t('logText')}</p>
            </div>
            <ul data-testid="landing-log" className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-background">
              {recent.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">{t('logEmpty')}</li>}
              {recent.map((j, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 px-4 py-2.5">
                  <span className="truncate">
                    <span className="font-medium">{j.title}</span>
                    <span className="text-muted-foreground"> · {j.company}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {j.source && <span>{sourceInfo(j.source)?.name ?? j.source}</span>}
                    {j.at && stats && <span>{format.relativeTime(new Date(j.at), stats.fetchedAt)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The product itself: a board in four columns with the real badges, and what each one means. */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl">{t('boardTitle')}</h2>
            <p className="mt-4 text-muted-foreground">{t('boardText')}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold tracking-normal text-muted-foreground">{t('colSaved')}</h3>
              <DemoCard title="Full-Stack Engineer" company="Product · DOU" score={96} />
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold tracking-normal text-muted-foreground">{t('colApplied')}</h3>
              <DemoCard title="Junior Frontend Engineer" company="robota.ua" tone="wait" score={100} badge={<StatusBadge tone="wait" icon={AlarmClock}>{t('cardPing')}</StatusBadge>} note={t('noteScore')} />
              <DemoCard title="Full-stack Engineer" company="Djinni" tone="neutral" badge={<StatusBadge tone="neutral" icon={Bot}>{t('cardAuto')}</StatusBadge>} note={t('noteAuto')} />
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold tracking-normal text-muted-foreground">{t('colTalk')}</h3>
              <DemoCard title="Web Developer" company="Djinni" tone="move" badge={<StatusBadge tone="move" icon={CircleHelp}>{t('cardQuestion')}</StatusBadge>} note={t('noteArrow')} />
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold tracking-normal text-muted-foreground">{t('colInterview')}</h3>
              <DemoCard title="Senior Full-Stack Engineer" company="DOU" tone="interview" badge={<StatusBadge tone="interview" icon={CalendarClock}>{t('cardInterview')}</StatusBadge>} />
            </div>
          </div>
        </section>

        {/* What we refuse to do, set as a crossed-out list: the promise reads at a glance. */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
            <h2 className="text-3xl md:text-4xl">{t('notTitle')}</h2>
            <ul className="mt-8 flex flex-col divide-y divide-border">
              {([1, 2, 3] as const).map((i) => (
                <li key={i} className="grid gap-1 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-baseline md:gap-8">
                  <span className="text-2xl font-semibold tracking-[-0.02em] text-muted-foreground line-through decoration-danger decoration-2 md:text-3xl">{t(`not${i}`)}</span>
                  <span className="text-muted-foreground">{t(`not${i}Text`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <h2 className="text-3xl md:text-4xl">{t('faqTitle')}</h2>
            <dl className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
              {([1, 2, 3, 4] as const).map((i) => (
                <div key={i}>
                  <dt className="font-semibold">{t(`q${i}`)}</dt>
                  <dd className="mt-1 text-muted-foreground">{t(`a${i}`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-border bg-card/40">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center md:py-20">
            <WatchingB className="h-24 w-auto shrink-0" />
            <div className="flex-1">
              <h2 className="text-3xl md:text-4xl">{t('finalTitle')}</h2>
              <p className="mt-2 text-muted-foreground">{t('finalText')}</p>
            </div>
            <Link href="/login" className={`${cta} bg-brand text-brand-foreground`}>{t('start')}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground">
          <Logo name={tApp('name')} />
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
