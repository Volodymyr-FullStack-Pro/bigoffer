import { Ban } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Coin, Logo } from '@/components/brand/logo';
import { LegalLinks } from '@/components/legal-links';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Link } from '@/i18n/navigation';
import { Bento, type BentoText } from './bento';
import { HeroApp } from './hero-app';
import { AppFrame, CountUp, Reveal, StickyStory, TiltIn } from './motion';
import { BoardScreen, ChatScreen, CvScreen, FeedScreen, TelegramScreen } from './showcase';
import type { LandingStats } from './stats';
import { WatchingB } from './watching-b';

const SHOW_KEYS = [
  'match', 'hiring', 'met', 'why', 'market', 'above', 'ats', 'cv1', 'cv2', 'cv3', 'boosted', 'unverified', 'question', 'interview', 'ping', 'auto',
  'noteArrow', 'noteScore', 'noteAuto', 'now', 'tgTitle', 'tgWhy', 'tgOpen', 'tgKit', 'tgSave', 'tgHide', 'chatTitle', 'chatQ', 'chatA', 'chatPlaceholder',
] as const;
const BENTO_KEYS = ['radarTitle', 'radarText', 'extTitle', 'extText', 'extName', 'extEmail', 'extSalary', 'payTitle', 'payText', 'payYou', 'tgTitle', 'tgText', 'tgMsg', 'peopleTitle', 'peopleText'] as const;

const cta = 'btn brutal-press inline-flex items-center justify-center rounded-xl px-6 py-3.5 font-semibold';

export async function Landing({ stats }: { stats: LandingStats | null }) {
  const t = await getTranslations('landing');
  const tApp = await getTranslations('app');
  const tTheme = await getTranslations('theme');
  const recent = (stats?.recent ?? []).slice(0, 24);
  const show = Object.fromEntries(SHOW_KEYS.map((k) => [k, t(`show.${k}`)]));
  const bento = Object.fromEntries(BENTO_KEYS.map((k) => [k, t(`bento.${k}`)])) as BentoText;
  const story = [
    { title: t('s1Title'), text: t('s1Text'), url: 'bigoffer.app/today', screen: <FeedScreen t={show} /> },
    { title: t('s2Title'), text: t('s2Text'), url: 'bigoffer.app/cv', screen: <CvScreen t={show} /> },
    { title: t('s3Title'), text: t('s3Text'), url: 'bigoffer.app/board', screen: <BoardScreen t={show} /> },
    { title: t('s4Title'), text: t('s4Text'), url: 'telegram · BigOffer', screen: <TelegramScreen t={show} /> },
    { title: t('s5Title'), text: t('s5Text'), url: 'bigoffer.app/today?kit=1', screen: <ChatScreen t={show} /> },
  ];

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
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
        {/* Hero: the promise, centered, then the product itself leaning back and straightening as you scroll. */}
        <section className="mx-auto max-w-6xl px-4 pt-16 md:pt-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {stats && stats.day > 0 ? t('pill', { day: stats.day }) : t('pillOffline')}
            </span>
            <h1 className="text-5xl leading-[1.02] font-extrabold tracking-[-0.045em] text-balance md:text-7xl">{t('heroTitle')}</h1>
            <p className="mt-6 max-w-[56ch] text-lg text-muted-foreground md:text-xl">{t('heroSub')}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" data-testid="landing-start" className={`${cta} bg-brand text-brand-foreground`}>
                {t('start')}
                <Coin className="ml-2 size-5" />
              </Link>
              <a href="#story" className={`${cta} border border-border hover:bg-muted`}>{t('seeHow')}</a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t('heroNote')}</p>
          </div>
          <div className="relative mt-16 md:mt-20">
            <WatchingB className="absolute -top-16 right-8 z-10 h-20 w-auto md:-top-24 md:right-16 md:h-32" />
            <TiltIn>
              <AppFrame url="bigoffer.app/today">
                <HeroApp
                  t={{
                    nav: [t('app.nav1'), t('app.nav2'), t('app.nav3'), t('app.nav4'), t('app.nav5'), t('app.nav6')],
                    title: t('app.title'),
                    count: t('app.count'),
                    stats: [[ '6', t('app.st1') ], [ '4', t('app.st2') ], [ '2', t('app.st3') ], [ '11', t('app.st4') ]],
                    match: t('radarMatch'),
                    why: t('app.why'),
                    apply: t('app.apply'),
                  }}
                />
              </AppFrame>
            </TiltIn>
          </div>
        </section>

        {/* Numbers from the boards: one huge figure on the left, the rest stepping down on the right. */}
        <section className="mt-24 border-y border-border bg-card/40 md:mt-32">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-12 md:py-20">
            <Reveal className="md:col-span-7">
              <span className="block font-display text-[6.5rem] leading-[0.85] font-extrabold tracking-[-0.06em] text-brand tabular-nums md:text-[11rem]">
                {stats?.day ? <CountUp value={stats.day} /> : '—'}
              </span>
              <span className="mt-4 block max-w-[30ch] text-xl md:text-2xl">{t('statDayLong')}</span>
            </Reveal>
            <dl className="flex flex-col md:col-span-5">
              {[
                [stats?.week ?? null, t('statWeek'), ''],
                [3, t('statBoards'), 'md:ml-10'],
                [10, t('statRadar'), 'md:ml-20'],
              ].map(([value, label, indent], i) => (
                <Reveal key={label as string} delay={120 * (i + 1)} className={`border-b border-border py-5 last:border-b-0 ${indent as string}`}>
                  <dt className="sr-only">{label as string}</dt>
                  <dd className="flex items-baseline gap-4">
                    <span className="w-28 shrink-0 font-display text-5xl font-extrabold tracking-[-0.04em] tabular-nums">
                      {i === 2 && <span className="text-muted-foreground">≤</span>}
                      {typeof value === 'number' ? <CountUp value={value} /> : '—'}
                    </span>
                    <span className="text-muted-foreground">{label as string}</span>
                  </dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* The story of one application, told as you scroll: the screen beside it changes with each step. */}
        <section id="story" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 md:pt-28">
          <Reveal className="max-w-2xl">
            <h2 className="text-4xl tracking-[-0.035em] md:text-6xl">{t('storyTitle')}</h2>
            <p className="mt-4 text-lg text-muted-foreground">{t('storyText')}</p>
          </Reveal>
          <div className="mt-6">
            <StickyStory steps={story} />
          </div>
        </section>

        {/* Everything else, in a bento: the live radar gets the biggest tile. */}
        <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <Reveal className="mb-10 max-w-2xl">
            <h2 className="text-4xl tracking-[-0.035em] md:text-6xl">{t('bentoTitle')}</h2>
          </Reveal>
          <Bento
            t={bento}
            jobs={recent}
            radar={{ title: t('radarTitle'), live: t('radarLive'), toFeed: t('radarToFeed'), hidden: [t('radarHide1'), t('radarHide2'), t('radarHide3')], match: t('radarMatch'), profile: t('radarProfile') }}
          />
        </section>

        {/* What we refuse to do: three cards, each crossed out. */}
        <section className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
          <Reveal className="mb-10 max-w-2xl">
            <h2 className="text-4xl tracking-[-0.035em] md:text-6xl">{t('notTitle')}</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {([1, 2, 3] as const).map((i) => (
              <Reveal key={i} delay={i * 100} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
                <span aria-hidden className="grid size-11 place-items-center rounded-full bg-danger/15 text-danger">
                  <Ban className="size-5" />
                </span>
                <span className="text-2xl font-bold tracking-[-0.02em] line-through decoration-danger decoration-2">{t(`not${i}`)}</span>
                <span className="text-muted-foreground">{t(`not${i}Text`)}</span>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Short answers, as cards that open. */}
        <section className="border-t border-border bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:py-28">
            <Reveal>
              <h2 className="text-4xl tracking-[-0.035em] md:text-6xl">{t('faqTitle')}</h2>
              <p className="mt-4 text-muted-foreground">{t('faqText')}</p>
            </Reveal>
            <div className="flex flex-col gap-3">
              {([1, 2, 3, 4] as const).map((i) => (
                <details key={i} className="group rounded-2xl border border-border bg-background px-5 py-4 open:border-brand/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                    {t(`q${i}`)}
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xl leading-none transition-transform group-open:rotate-45 group-open:bg-brand group-open:text-brand-foreground">+</span>
                  </summary>
                  <p className="mt-3 text-muted-foreground">{t(`a${i}`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* The closing banner: solid mint, the two characters large, one button. */}
        <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] bg-brand px-6 py-12 text-brand-foreground md:px-14 md:py-16">
              <div className="relative z-10 max-w-xl">
                <h2 className="text-5xl leading-[1] font-extrabold tracking-[-0.045em] md:text-7xl">{t('finalTitle')}</h2>
                <p className="mt-5 text-lg text-brand-foreground/75 md:text-xl">{t('finalText')}</p>
                <Link href="/login" data-testid="landing-final" className="btn brutal-press mt-8 inline-flex items-center rounded-xl bg-[#0f1116] px-6 py-3.5 font-semibold text-white">
                  {t('start')}
                </Link>
              </div>
              <div aria-hidden className="pointer-events-none absolute right-6 -bottom-6 hidden items-end gap-3 md:flex">
                <span className="rounded-[2.5rem] bg-[#0f1116] p-5">
                  <WatchingB className="h-44 w-auto" />
                </span>
                <span className="landing-coin mb-4 rounded-full bg-[#0f1116] p-3">
                  <Coin className="size-24" />
                </span>
              </div>
            </div>
          </Reveal>
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
