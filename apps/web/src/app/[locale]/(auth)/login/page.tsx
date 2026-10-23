import { safeRedirectPath } from '@jp/core';
import { getTranslations } from 'next-intl/server';
import { WatchingB } from '@/components/landing/watching-b';
import { Link } from '@/i18n/navigation';
import { LegalLinks } from '@/components/legal-links';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { publicEnv } from '@/env';
import { GoogleButton } from './google-button';
import { LoginForm } from './login-form';
import { Coin, Logo } from '@/components/brand/logo';

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
  const tLanding = await getTranslations('landing');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" aria-label={tApp('name')}>
            <Logo name={tApp('name')} />
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }} />
          </div>
        </div>
      </header>
      {/* The brand's pair beside the form: the happy b watching, the coin it found. */}
      <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:py-20">
        <div className="flex flex-col items-start gap-6">
          <div className="flex items-end gap-1">
            <WatchingB className="h-36 w-auto md:h-56" />
            <Coin className="landing-coin mb-1 size-16 md:size-24" />
          </div>
          <h2 className="text-4xl leading-[1.05] md:text-5xl">{tLanding('heroTitle')}</h2>
        </div>
        <section className="brutal flex w-full flex-col gap-5 p-6 sm:p-8">
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
          <LegalLinks className="text-xs text-muted-foreground" />
        </section>
      </main>
    </div>
  );
}
