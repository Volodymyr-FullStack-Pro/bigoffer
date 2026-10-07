'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export function GoogleButton() {
  const t = useTranslations('auth');
  const locale = useLocale();

  return (
    <Button
      type="button"
      onClick={() =>
        createBrowserSupabase().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/auth/callback?next=/${locale}/today` },
        })
      }
    >
      {t('google')}
    </Button>
  );
}
