const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '\u2014',
  ndash: '\u2013',
  laquo: '\u00ab',
  raquo: '\u00bb',
  hellip: '\u2026',
  euro: '\u20ac',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bull: '\u2022',
  copy: '\u00a9',
};

function safeCodePoint(n: number, original: string): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : original;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, hex: string) => safeCodePoint(parseInt(hex, 16), m))
    .replace(/&#(\d+);/g, (m, dec: string) => safeCodePoint(Number(dec), m))
    .replace(/&([a-z]+);/g, (m, name: string) => NAMED[name] ?? m);
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    // HN and some feeds open paragraphs without closing them: `First<p>Second`.
    .replace(/<\s*p(\s[^>]*)?\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(withBreaks)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * The language a short text (a form question) is written in: Cyrillic with Russian-only letters is "ru", other
 * Cyrillic "uk", anything else "en".
 */
export function textLang(s: string): 'en' | 'uk' | 'ru' {
  const cyr = (s.match(/[а-яёіїєґ]/gi) ?? []).length;
  const lat = (s.match(/[a-z]/gi) ?? []).length;
  if (cyr === 0 || lat > cyr) return 'en';
  if (/[іїєґ]/i.test(s)) return 'uk';
  return /[ыэъё]/i.test(s) ? 'ru' : 'uk';
}
