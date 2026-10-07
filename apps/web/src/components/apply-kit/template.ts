export type LetterTemplate = { locale: string; body: string };

/** Explicit lang -> that locale's template. 'auto' -> the profile locale's template, else en, else none. */
export function chooseTemplate(templates: LetterTemplate[] | null | undefined, lang: 'auto' | 'en' | 'uk' | 'ru', profileLocale: string | null | undefined): string | null {
  const list = templates ?? [];
  const find = (l: string) => list.find((t) => t.locale === l)?.body ?? null;
  if (lang !== 'auto') return find(lang);
  return (profileLocale ? find(profileLocale) : null) ?? find('en');
}
