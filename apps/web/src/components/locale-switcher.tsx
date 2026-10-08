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
    <div role="group" aria-label={t('label')} className="brutal flex overflow-hidden p-0">
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
          className={`px-2.5 py-1.5 font-mono text-xs uppercase ${
            current === locale ? 'bg-brand text-brand-foreground' : 'hover:bg-muted'
          }`}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
