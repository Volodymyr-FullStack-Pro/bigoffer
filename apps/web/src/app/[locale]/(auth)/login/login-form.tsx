'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { sendMagicLink, type LoginState } from './actions';

export function LoginForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: 'idle',
  });

  if (state.status === 'sent') {
    return (
      <p role="status" className="brutal bg-brand p-4 text-brand-foreground">
        {t('sent')}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase">{t('email')}</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="brutal bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      {state.status === 'invalid' && <p className="text-sm text-danger">{t('invalidEmail')}</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{t('error')}</p>}
      <Button type="submit" variant="brand" disabled={pending}>
        {t('send')}
      </Button>
    </form>
  );
}
