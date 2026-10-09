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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-12">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-black">{tApp('name')}</span>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle
            labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }}
          />
        </div>
      </div>
      <section className="brutal flex flex-col gap-5 p-6">
        <div>
          <h1 className="text-3xl font-black">{t('title')}</h1>
          <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
        </div>
        {error && <p className="text-sm text-danger">{t('error')}</p>}
        <LoginForm next={next} />
        {publicEnv.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED && (
          <>
            <div className="text-center font-mono text-xs uppercase text-muted-foreground">
              {t('or')}
            </div>
            <GoogleButton next={next} />
          </>
        )}
      </section>
      <p className="text-center text-sm text-muted-foreground">{tApp('tagline')}</p>
      <LegalLinks className="text-center text-xs text-muted-foreground" />
    </main>
  );
}
