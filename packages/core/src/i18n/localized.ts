import type { Locale } from './locales';

export type LocalizedText = Partial<Record<Locale, string>>;

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

export function localized(field: LocalizedText | null | undefined, locale: Locale): string {
  if (!field) return '';
  return (
    nonEmpty(field[locale]) ??
    nonEmpty(field.en) ??
    Object.values(field).find((v): v is string => nonEmpty(v) !== undefined) ??
    ''
  );
}
