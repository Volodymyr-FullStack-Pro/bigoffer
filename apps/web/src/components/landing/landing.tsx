import { getTranslations } from 'next-intl/server';
import { Coin, Logo } from '@/components/brand/logo';
import { LegalLinks } from '@/components/legal-links';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Link } from '@/i18n/navigation';
import type { LandingStats } from './stats';
import { Radar } from './radar';
import { Showcase } from './showcase';
import { WatchingB } from './watching-b';

const SHOW_KEYS = [
  'tab_feed', 'tab_feed_hint', 'tab_cv', 'tab_cv_hint', 'tab_board', 'tab_board_hint', 'tab_telegram', 'tab_telegram_hint', 'tab_chat', 'tab_chat_hint',
  'match', 'hiring', 'met', 'why', 'market', 'above', 'ats', 'cv1', 'cv2', 'cv3', 'boosted', 'unverified', 'question', 'interview', 'ping', 'auto',
  'noteArrow', 'noteScore', 'noteAuto', 'now', 'tgTitle', 'tgWhy', 'tgOpen', 'tgKit', 'tgSave', 'tgHide', 'chatTitle', 'chatQ', 'chatA', 'chatPlaceholder',
] as const;

const cta = 'btn brutal-press inline-flex items-center justify-center rounded-xl px-5 py-3 font-semibold';

export async function Landing({ stats }: { stats: LandingStats | null }) {
  const t = await getTranslations('landing');
  const tApp = await getTranslations('app');
  const tTheme = await getTranslations('theme');
  const recent = (stats?.recent ?? []).slice(0, 24);
  const show = Object.fromEntries(SHOW_KEYS.map((k) => [k, t(`show.${k}`)]));

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
        {/* The one moment: real postings arrive on the radar, get a match score, and the strong ones go to the feed. */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-16 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-12 md:pt-24 md:pb-24">
          <div>
            <h1 className="text-5xl leading-[1.02] font-extrabold tracking-[-0.04em] md:text-[4.25rem]">{t('heroTitle')}</h1>
            <p className="mt-6 max-w-[52ch] text-lg text-muted-foreground md:text-xl">
              {stats && stats.day > 0
                ? t.rich('heroLive', { day: stats.day, b: (c) => <b className="font-semibold text-foreground tabular-nums">{c}</b> })
                : t('heroOffline')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/login" data-testid="landing-start" className={`${cta} bg-brand text-brand-foreground`}>
                {t('start')}
                <Coin className="ml-2 size-5" />
              </Link>
              <span className="text-sm text-muted-foreground">{t('heroNote')}</span>
            </div>
          </div>
          <div className="pt-16 md:pt-10">
            <Radar
              jobs={recent}
              labels={{ title: t('radarTitle'), live: t('radarLive'), toFeed: t('radarToFeed'), hidden: [t('radarHide1'), t('radarHide2'), t('radarHide3')], match: t('radarMatch'), profile: t('radarProfile') }}
            />
          </div>
        </section>

        {/* Numbers from the boards, large: what the radar read this week. */}
        <section className="border-y border-border bg-card/40">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4">
            {[
              [stats ? String(stats.day) : '—', t('statDay')],
              [stats ? String(stats.week) : '—', t('statWeek')],
              ['3', t('statBoards')],
              [t('statRadarValue'), t('statRadar')],
            ].map(([value, label], i) => (
              <div key={label} className={`px-4 py-8 ${i % 2 ? 'border-l' : ''} ${i >= 2 ? 'border-t md:border-t-0' : ''} ${i === 2 ? 'md:border-l' : ''} border-border`}>
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="block font-display text-4xl font-extrabold tracking-[-0.03em] tabular-nums md:text-5xl">{value}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* The app itself, a screen at a time. */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-5xl">{t('showTitle')}</h2>
            <p className="mt-4 text-muted-foreground">{t('showText')}</p>
          </div>
          <div className="mt-10">
            <Showcase t={show} />
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
            <span className="flex shrink-0 items-end gap-1">
              <WatchingB className="h-24 w-auto" />
              <Coin className="mb-0.5 size-11" />
            </span>
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
