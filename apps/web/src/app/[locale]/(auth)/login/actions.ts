'use server';

import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { status: 'idle' | 'sent' | 'invalid' | 'error' };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(formData.get('email'));
  if (!email.success) return { status: 'invalid' };

  const locale = await getLocale();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${serverEnv().SITE_URL}/auth/confirm?next=/${locale}/today`,
    },
  });
  return { status: error ? 'error' : 'sent' };
}
