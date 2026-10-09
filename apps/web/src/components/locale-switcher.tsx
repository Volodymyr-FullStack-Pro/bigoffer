'use client';

import { LOCALES, type Locale } from '@jp/core';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleSwitcher({
  onChangeAction,
}: {
  onChangeAction?: (locale: Locale) => Promise<void>;
}) {
  const t = useTranslations('locale');
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t('label')} className="flex rounded-full bg-muted p-0.5">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          data-testid={`locale-${locale}`}
          aria-pressed={current === locale}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onChangeAction?.(locale);
              router.replace(pathname, { locale });
            })
          }
          className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase transition-colors ${
            current === locale ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
