import { sourceInfo } from '@jp/core';
import { AlarmClock, Bot, CalendarClock, CircleHelp, KeyRound, Lock, PartyPopper, Send, UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { LegalLinks } from '@/components/legal-links';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { StatusBadge } from '@/components/ui/status-badge';
import { TechChip } from '@/components/ui/tech-chip';
import { Link } from '@/i18n/navigation';
import type { LandingStats } from './stats';

const cta = 'btn brutal-press inline-flex items-center justify-center rounded-xl px-5 py-3 font-semibold';

/** A match ring: the stroke fills to the score, the number sits inside. */
function Ring({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className="absolute font-display text-lg font-extrabold tabular-nums">{score}</span>
    </span>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children?: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)] gap-4 pb-12 pl-12 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
      <span aria-hidden className="absolute top-0 left-0 grid size-8 place-items-center rounded-full bg-brand font-display text-sm font-extrabold text-brand-foreground">{n}</span>
      <div>
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-3xl">{title}</h3>
        <p className="mt-2 max-w-[52ch] text-muted-foreground">{text}</p>
      </div>
      {children && <div className="md:pt-1">{children}</div>}
    </li>
  );
}

export async function Landing({ stats }: { stats: LandingStats | null }) {
  const t = await getTranslations('landing');
  const tApp = await getTranslations('app');
  const tTheme = await getTranslations('theme');
  const recent = stats?.recent ?? [];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label={tApp('name')}>
            <Logo name={tApp('name')} />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">{t('navHow')}</a>
            <a href="#trust" className="hover:text-foreground">{t('navTrust')}</a>
            <a href="#faq" className="hover:text-foreground">{t('navFaq')}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <span className="hidden sm:block">
              <ThemeToggle labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }} />
            </span>
            {/* A phone has room for one button: sign-in (the hero already offers the start). */}
            <Link href="/login" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold sm:border-0 sm:px-2">{t('signIn')}</Link>
            <Link href="/login" data-testid="landing-start-top" className="btn brutal-press hidden rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground sm:inline-flex">{t('start')}</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: the promise on the left, what the first minutes look like on the right. */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-14 md:grid-cols-[1.15fr_1fr] md:pt-24 md:pb-20">
          <div>
            <h1 className="font-display text-5xl leading-[0.98] font-extrabold tracking-[-0.045em] text-balance md:text-7xl">{t('heroTitle')}</h1>
            <p className="mt-6 max-w-[54ch] text-lg text-muted-foreground md:text-xl">{t('heroText')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" data-testid="landing-start" className={`${cta} bg-brand text-brand-foreground`}>{t('heroCta')}</Link>
              <a href="#how" className={`${cta} border border-border hover:bg-muted`}>{t('heroSecondary')}</a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t('heroNote')}</p>
          </div>

          <div aria-hidden className="relative mx-auto w-full max-w-lg">
            <div className="mb-3 ml-auto flex w-fit items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2 text-sm shadow-[var(--shadow)]">
              <Send className="size-4 text-status-move" />
              <span className="font-semibold">{t('demoAlert', { ago: t('demoAgo') })}</span>
            </div>
            <div className="brutal flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-xl font-bold">{t('demoTitle')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t('demoMeta')}</p>
                </div>
                <span className="flex flex-col items-center gap-1">
                  <Ring score={93} />
                  <span className="text-xs text-muted-foreground">{t('demoMatch')}</span>
                </span>
              </div>
              <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm">{t('demoWhy')}</p>
              <span className="flex flex-wrap gap-1.5">
                {['React', 'TypeScript', 'Node.js', 'Next.js', 'PostgreSQL'].map((s) => <TechChip key={s} name={s} />)}
              </span>
              <span className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <span className="flex gap-1.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Djinni</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">DOU</span>
                </span>
                <span className="rounded-[10px] bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-brand-foreground">{t('demoApply')}</span>
              </span>
            </div>
          </div>
        </section>

        {/* Live numbers from the boards: what the radar saw today, not a slogan. */}
        <section className="border-y border-border">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4">
            {[
              [stats ? String(stats.day) : '—', t('statDay')],
              [stats ? String(stats.week) : '—', t('statWeek')],
              ['3', t('statBoards')],
              [t('statRadarValue'), t('statRadar')],
            ].map(([value, label], i) => (
              <div key={label} className={`px-4 py-7 ${i % 2 ? 'border-l' : ''} ${i === 2 ? 'border-t md:border-t-0 md:border-l' : ''} ${i === 3 ? 'border-t md:border-t-0' : ''} border-border`}>
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="block font-display text-4xl font-extrabold tracking-[-0.03em] tabular-nums md:text-5xl">{value}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{label}</span>
                </dd>
              </div>
            ))}
          </dl>
          {recent.length > 0 && (
            <div className="landing-ticker relative overflow-hidden border-t border-border py-3" aria-label={t('tickerLabel')}>
              <div className="landing-ticker-track flex w-max gap-8 font-mono text-sm text-muted-foreground">
                {[...recent, ...recent].map((j, i) => (
                  <span key={i} aria-hidden={i >= recent.length || undefined} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="size-1.5 rounded-full bg-brand" />
                    <span className="text-foreground">{j.title}</span>
                    <span>· {j.company}</span>
                    {j.source && <span className="text-xs">· {sourceInfo(j.source)?.name ?? j.source}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:py-28">
          <p className="text-sm font-semibold text-brand">{t('howEyebrow')}</p>
          <h2 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.035em] md:text-6xl">{t('howTitle')}</h2>
          <ol className="relative mt-14 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
            <Step n={1} title={t('s1Title')} text={t('s1Text')}>
              <div className="brutal flex items-center gap-3 p-4 text-sm">
                <Send className="size-5 shrink-0 text-status-move" />
                <span className="min-w-0">
                  <span className="block font-semibold">{t('demoAlert', { ago: t('demoAgo') })}</span>
                  <span className="block truncate text-muted-foreground">{t('demoTitle')} · 93%</span>
                </span>
              </div>
            </Step>
            <Step n={2} title={t('s2Title')} text={t('s2Text')}>
              <div className="brutal flex items-center gap-4 p-4">
                <Ring score={88} size={56} />
                <p className="text-sm text-muted-foreground">{t('demoWhy')}</p>
              </div>
            </Step>
            <Step n={3} title={t('s3Title')} text={t('s3Text')} />
            <Step n={4} title={t('s4Title')} text={t('s4Text')}>
              <div className="brutal flex flex-wrap gap-2 p-4">
                <StatusBadge tone="move" icon={CircleHelp}>{t('boardQuestion')}</StatusBadge>
                <StatusBadge tone="interview" icon={CalendarClock}>{t('boardInvite')}</StatusBadge>
                <StatusBadge tone="neutral" icon={Bot}>{t('boardAuto')}</StatusBadge>
              </div>
            </Step>
            <Step n={5} title={t('s5Title')} text={t('s5Text')}>
              <ul className="brutal flex flex-col divide-y divide-border p-1 text-sm">
                {[
                  ['Full-Stack Engineer', 100],
                  ['Junior Frontend Engineer', 93],
                  ['Web Developer', 58],
                ].map(([title, score]) => (
                  <li key={title} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="min-w-0 truncate">{title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge tone="wait" icon={AlarmClock}>{t('boardPing')}</StatusBadge>
                      <span className="w-10 text-right font-semibold tabular-nums">{score}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Step>
            <Step n={6} title={t('s6Title')} text={t('s6Text')} />
            <Step n={7} title={t('s7Title')} text={t('s7Text')}>
              <div className="brutal flex items-center gap-3 p-4">
                <StatusBadge tone="offer" icon={PartyPopper}>{t('boardOffer')}</StatusBadge>
              </div>
            </Step>
          </ol>
        </section>

        <section id="trust" className="scroll-mt-20 border-y border-border bg-card/40">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
            <p className="text-sm font-semibold text-brand">{t('trustEyebrow')}</p>
            <h2 className="mt-2 max-w-3xl font-display text-4xl font-extrabold tracking-[-0.035em] md:text-6xl">{t('trustTitle')}</h2>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                [UserRound, t('t1Title'), t('t1Text')],
                [KeyRound, t('t2Title'), t('t2Text')],
                [Lock, t('t3Title'), t('t3Text')],
              ].map(([Icon, title, text]) => {
                const I = Icon as typeof Lock;
                return (
                  <div key={title as string} className="brutal p-6">
                    <I aria-hidden className="size-6 text-brand" />
                    <h3 className="mt-4 font-display text-xl font-bold">{title as string}</h3>
                    <p className="mt-2 text-muted-foreground">{text as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 md:py-28">
          <h2 className="font-display text-4xl font-extrabold tracking-[-0.035em] md:text-5xl">{t('faqTitle')}</h2>
          <div className="mt-10 divide-y divide-border border-y border-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <details key={i} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold">
                  {t(`q${i}` as never)}
                  <span aria-hidden className="text-2xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-muted-foreground">{t(`a${i}` as never)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center md:py-28">
            <h2 className="font-display text-5xl leading-[1] font-extrabold tracking-[-0.045em] text-balance md:text-7xl">{t('finalTitle')}</h2>
            <p className="mt-6 max-w-[48ch] text-lg text-muted-foreground">{t('finalText')}</p>
            <Link href="/login" className={`${cta} mt-8 bg-brand text-brand-foreground`}>{t('heroCta')}</Link>
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
