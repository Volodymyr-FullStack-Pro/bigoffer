import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Landing } from '@/components/landing/landing';
import { loadLandingStats } from '@/components/landing/stats';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getUserId } from '@/lib/auth';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'landing' });
  return { title: t('title'), description: t('description') };
}

/** Signed in: straight to Today. Signed out: the landing. */
export default async function LocaleIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (await getUserId()) redirect({ href: '/today', locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale });
  return <Landing stats={await loadLandingStats()} />;
}
