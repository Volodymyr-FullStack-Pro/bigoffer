import { hasLocale } from 'next-intl';
import type { ReactNode } from 'react';
import { Genie } from '@/components/genie/genie';
import { LegalLinks } from '@/components/legal-links';
import { BottomNav } from '@/components/shell/bottom-nav';
import { Header } from '@/components/shell/header';
import { Sidebar } from '@/components/shell/sidebar';
import { routing } from '@/i18n/routing';
import { requireUserId } from '@/lib/auth';

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: requested } = await params;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  await requireUserId(locale);

  return (
    <>
      <Header />
      <div className="mx-auto flex max-w-7xl gap-8 px-4 pt-6 pb-24 md:pb-10">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <footer className="mx-auto hidden max-w-7xl px-4 pb-6 md:block">
        <LegalLinks className="text-xs text-muted-foreground" />
      </footer>
      <BottomNav />
      <Genie />
    </>
  );
}
