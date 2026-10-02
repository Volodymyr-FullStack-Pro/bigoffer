export function detectRemote(text: string): 'remote' | 'hybrid' | 'office' | 'unknown' {
  const t = text
    .toLowerCase()
    .replace(/\b(not|no|non)[-\s]+remote(ly)?\b/g, ' ')
    .replace(/\bremote[-\s]+control\b/g, ' ')
    .replace(/\b(hybrid[-\s]+cloud)\b/g, ' ')
    .replace(/\b(ms|microsoft)[-\s]+office\b|\boffice[-\s]?365\b/g, ' ');
  if (/hybrid|гібрид|гибрид/.test(t)) return 'hybrid';
  if (
    /\bremote(ly)?\b|work from anywhere|anywhere in the world|work from home|\bwfh\b|віддален|дистанційн|удаленн|удалённ|удаленк/.test(
      t,
    )
  )
    return 'remote';
  if (/\bon-?site\b|\boffice\b|офіс|офис/.test(t)) return 'office';
  return 'unknown';
}

const SENIORITY_PATTERNS: [NonNullable<ReturnType<typeof detectSeniority>>, RegExp][] = [
  ['lead', /\b(lead(?!\s+gen(eration)?\b)|principal|head of|architect)\b|\bstaff(?=\s+(software|engineer|developer|scientist|designer)\b)|тімлід|тимлид|техлід|техлид/i],
  ['senior', /\b(senior|sr\.?)(?=\s|$|[^a-z])|сеньйор|сеньор|синьор/i],
  ['middle', /\b(middle|mid-level|mid(?![-\s]*market))\b|мідл|мидл/i],
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
  if (/\$|\busd\b/.test(t)) return 'USD';
  if (/€|\beur\b/.test(t)) return 'EUR';
  if (/грн|uah|₴/.test(t)) return 'UAH';
  return 'USD';
}

function numbers(raw: string): number[] {
  const found: { value: number; k: boolean }[] = [];
  for (const m of raw.matchAll(/(\d[\d\s,.]*\d|\d)\s*(k\b)?/gi)) {
    const digits = m[1]!.replace(/[\s,]/g, '').replace(/\.(?=\d{3}\b)/g, '');
    const value = Number.parseFloat(digits);
    if (Number.isFinite(value)) found.push({ value, k: Boolean(m[2]) });
  }
  const sharedK = found.length > 1 && found[found.length - 1]!.k;
  return found
    .map((f) => (f.k || (sharedK && f.value < 1000) ? f.value * 1000 : f.value))
    .filter((v) => v >= 100);
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

  const annual = period === 'year' || (period !== 'month' && Math.max(...values) * rate > 20000);
  const toMonthlyUsd = (v: number | null): number | null => {
    if (v == null) return null;
    const usd = v * rate;
    return Math.round(annual ? usd / 12 : usd);
  };
  return { minUsd: toMonthlyUsd(min), maxUsd: toMonthlyUsd(max) };
}
