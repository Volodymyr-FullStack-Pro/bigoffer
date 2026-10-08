import type { KitCandidate } from '@jp/ai';

export type LetterTemplate = { locale: string; body: string };

/** Explicit lang -> that locale's template. 'auto' -> the profile locale's template, else en, else none. */
export function chooseTemplate(templates: LetterTemplate[] | null | undefined, lang: 'auto' | 'en' | 'uk' | 'ru', profileLocale: string | null | undefined): string | null {
  const list = templates ?? [];
  const find = (l: string) => list.find((t) => t.locale === l)?.body ?? null;
  if (lang !== 'auto') return find(lang);
  return (profileLocale ? find(profileLocale) : null) ?? find('en');
}

const CONTACT_KEYS = ['email', 'phone', 'linkedin', 'github', 'portfolio', 'telegram'] as const;

/** The profile's name and non-empty string contacts, for the [Full name] / [Phone] / … template placeholders. */
export function kitCandidate(row: { full_name: string | null; contacts: unknown } | null | undefined): KitCandidate {
  const raw = row?.contacts && typeof row.contacts === 'object' ? (row.contacts as Record<string, unknown>) : {};
  const contacts: KitCandidate['contacts'] = {};
  for (const key of CONTACT_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) contacts[key] = v.trim();
  }
  return { fullName: row?.full_name?.trim() || null, contacts };
}
