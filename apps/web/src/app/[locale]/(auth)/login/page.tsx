import { safeRedirectPath } from '@jp/core';
import { getTranslations } from 'next-intl/server';
import { LegalLinks } from '@/components/legal-links';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { publicEnv } from '@/env';
import { GoogleButton } from './google-button';
import { LoginForm } from './login-form';

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
    <main className="mx-auto grid min-h-dvh max-w-6xl content-center gap-10 px-4 py-12 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <span className="flex items-baseline gap-0.5 font-display text-lg font-black uppercase">
            {tApp('name')}
            <span aria-hidden className="inline-block size-2 rounded-full bg-brand" />
          </span>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle
              labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }}
            />
          </div>
        </div>
        <div className="hidden flex-col gap-6 lg:flex">
          <p className="font-display text-5xl leading-[1.05] font-black tracking-tight text-balance">{tApp('tagline')}</p>
          {/* Decorative "terminal" — language-neutral, hidden from assistive tech. */}
          <pre aria-hidden className="brutal overflow-hidden p-5 font-mono text-sm leading-relaxed text-muted-foreground">
            <span className="text-brand">$</span> bigoffer match --stack react,node --remote{'\n'}
            <span className="text-success">✓</span> boards scanned · matches ranked by fit{'\n'}
            <span className="text-success">✓</span> top: <span className="text-foreground">94%</span> Senior Full-Stack Engineer{'\n'}
            <span className="text-brand">$</span> <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-brand" />
          </pre>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <section className="brutal flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <h1 className="text-3xl font-black">{t('title')}</h1>
            <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
          </div>
          {error && <p className="text-sm text-danger">{t('error')}</p>}
          <LoginForm next={next} />
          {publicEnv.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED && (
            <>
              <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t('or')}
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleButton next={next} />
            </>
          )}
        </section>
        <p className="text-center text-sm text-muted-foreground lg:hidden">{tApp('tagline')}</p>
        <LegalLinks className="text-center text-xs text-muted-foreground" />
      </div>
    </main>
  );
}
