export function detectRemote(text: string): 'remote' | 'hybrid' | 'office' | 'unknown' {
  const t = text.toLowerCase();
  if (/hybrid|гібрид|гибрид/.test(t)) return 'hybrid';
  if (/\bremote(ly)?\b|anywhere|work from home|\bwfh\b|віддален|дистанційн|удален|удалён/.test(t)) return 'remote';
  if (/\bon-?site\b|\boffice\b|офіс|офис/.test(t)) return 'office';
  return 'unknown';
}

const SENIORITY_PATTERNS: [NonNullable<ReturnType<typeof detectSeniority>>, RegExp][] = [
  ['lead', /\b(lead|principal|staff|head of|architect)\b|тімлід|тимлид|техлід|техлид/i],
  ['senior', /\b(senior|sr\.?)(?=\s|$|[^a-z])|сеньйор|сеньор|синьор/i],
  ['middle', /\b(middle|mid-level|mid)\b|мідл|мидл/i],
  ['junior', /\b(junior|jr\.?)(?=\s|$|[^a-z])|джуніор|джуниор/i],
  ['intern', /\b(intern|internship|trainee)\b|стажер|стажист|стажування/i],
];

export function detectSeniority(title: string): 'intern' | 'junior' | 'middle' | 'senior' | 'lead' | null {
  for (const [level, pattern] of SENIORITY_PATTERNS) {
    if (pattern.test(title)) return level;
  }
  return null;
}

/** Approximate conversion rates to USD; refresh occasionally. */
export const FX_TO_USD = { USD: 1, EUR: 1.08, UAH: 1 / 41.5 } as const;

function detectCurrency(raw: string): keyof typeof FX_TO_USD {
  const t = raw.toLowerCase();
  if (/€|eur/.test(t)) return 'EUR';
  if (/грн|uah|₴/.test(t)) return 'UAH';
  return 'USD';
}

function numbers(raw: string): number[] {
  const out: number[] = [];
  for (const m of raw.matchAll(/(\d[\d\s,.]*\d|\d)\s*(k\b)?/gi)) {
    const digits = m[1]!.replace(/[\s,]/g, '').replace(/\.(?=\d{3}\b)/g, '');
    let value = Number.parseFloat(digits);
    if (m[2]) value *= 1000;
    if (Number.isFinite(value) && value >= 100) out.push(value);
  }
  return out;
}

export function parseSalary(
  raw: string,
  period?: 'month' | 'year',
): { minUsd: number | null; maxUsd: number | null } | null {
  const values = numbers(raw);
  if (values.length === 0) return null;
  const rate = FX_TO_USD[detectCurrency(raw)];
  const t = raw.toLowerCase();
  const isUpTo = /(^|\s)(до|up to|to)\s/.test(t) && values.length === 1;
  const isFrom = /(^|\s)(від|от|from)\s/.test(t) && values.length === 1;

  let min: number | null = values[0]!;
  let max: number | null = values.length > 1 ? values[1]! : values[0]!;
  if (isUpTo) min = null;
  if (isFrom) max = null;

  const toMonthlyUsd = (v: number | null): number | null => {
    if (v == null) return null;
    let usd = v * rate;
    if (period === 'year' || (period !== 'month' && usd > 20000)) usd /= 12;
    return Math.round(usd);
  };
  return { minUsd: toMonthlyUsd(min), maxUsd: toMonthlyUsd(max) };
}
