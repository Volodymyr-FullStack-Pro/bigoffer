'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export function GoogleButton({ next }: { next?: string | undefined }) {
  const t = useTranslations('auth');
  const locale = useLocale();

  return (
    <Button
      type="button"
      onClick={() =>
        createBrowserSupabase().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? `/${locale}/today`)}` },
        })
      }
    >
      {t('google')}
    </Button>
  );
}
