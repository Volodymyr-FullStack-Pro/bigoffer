import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { fontVariables } from '../fonts';
import '../globals.css';
import { Providers } from './providers';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'app' });
  return { title: t('name'), description: t('tagline') };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <body className="antialiased">
        <NextIntlClientProvider>
          <Providers>
            <div className="relative z-10">{children}</div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
