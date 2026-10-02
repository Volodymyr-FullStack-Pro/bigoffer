import type { ReactNode } from 'react';
import { BottomNav } from '@/components/shell/bottom-nav';
import { Header } from '@/components/shell/header';
import { Sidebar } from '@/components/shell/sidebar';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect({ href: '/login', locale });

  return (
    <>
      <Header />
      <div className="mx-auto flex max-w-7xl gap-8 px-4 pt-6 pb-24 md:pb-10">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <BottomNav />
    </>
  );
}
