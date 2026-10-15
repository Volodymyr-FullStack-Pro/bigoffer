'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

const ORDER = ['email', 'phone', 'linkedin', 'github', 'portfolio', 'telegram'] as const;

export function ContactChips({ contacts, cvLink }: { contacts: Record<string, string>; cvLink: string | null }) {
  const t = useTranslations('kit');
  const [copied, setCopied] = useState<string | null>(null);
  // The user's own CV link wins over the 30-day link to the uploaded file.
  const cv = contacts.cv ?? cvLink;
  const items = [
    ...(cv ? [{ key: 'cv', label: t('contact_cv'), value: cv }] : []),
    ...ORDER.filter((k) => contacts[k]).map((k) => ({ key: k, label: t(`contact_${k}`), value: contacts[k]! })),
  ];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t('noContacts')}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('contacts')}>
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            data-testid="contact-chip"
            onClick={async () => {
              await navigator.clipboard.writeText(i.value).catch(() => undefined);
              setCopied(i.key);
            }}
            className="rounded-sm border-[1.5px] border-border px-2 py-0.5 tabular-nums text-xs hover:bg-muted"
          >
            {copied === i.key ? `✓ ${t('copied')}` : i.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
