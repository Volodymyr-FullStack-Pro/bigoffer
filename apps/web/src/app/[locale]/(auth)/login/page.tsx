import { safeRedirectPath } from '@jp/core';
import { getTranslations } from 'next-intl/server';
import { FlipWords } from '@/components/aceternity/flip-words';
import { Spotlight } from '@/components/aceternity/spotlight-new';
import { LegalLinks } from '@/components/legal-links';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { publicEnv } from '@/env';
import { GoogleButton } from './google-button';
import { LoginForm } from './login-form';
import { Logo } from '@/components/brand/logo';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string | string[] }>;
}) {
  const { error, next: rawNext } = await searchParams;
  // Where to return after sign-in (e.g. a Telegram deep link); same-origin relative paths only.
  const next = safeRedirectPath(typeof rawNext === 'string' ? rawNext : null) ?? undefined;
  const t = await getTranslations('auth');
  const tApp = await getTranslations('app');
  const tTheme = await getTranslations('theme');

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Spotlight />
      <header className="glass sticky top-0 z-20 rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span>
            <Logo name={tApp('name')} />
          </span>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }} />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-4 pt-16 pb-16 text-center md:pt-24">
        {/* Apple-style hero: one big headline with a rotating word, a soft spotlight behind it. */}
        <h2 className="max-w-4xl font-display text-5xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance md:text-7xl">
          <span>{tApp('heroBefore')} </span>
          <FlipWords words={tApp('heroWords').split(',')} className="text-brand" />
          <span> {tApp('heroAfter')}</span>
        </h2>
        <p className="-mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">{tApp('tagline')}</p>
        <section className="glass flex w-full max-w-md flex-col gap-5 rounded-3xl p-6 text-left shadow-[var(--shadow)] sm:p-8">
          <div>
            <h1 className="text-2xl">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
          </div>
          {error && <p className="text-sm text-danger">{t('error')}</p>}
          <LoginForm next={next} />
          {publicEnv.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t('or')}
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleButton next={next} />
            </>
          )}
        </section>
        <LegalLinks className="text-xs text-muted-foreground" />
      </main>
    </div>
  );
}
