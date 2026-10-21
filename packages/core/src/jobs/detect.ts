const REMOTE_WORDS = /\bremote(ly)?\b|work from anywhere|anywhere in the world|work from home|\bwfh\b|віддален|дистанційн|удаленн|удалённ|удаленк/;
const HYBRID_WORDS = /hybrid|гібрид|гибрид/;
/** A clause that names a format only to rule it out ("remote work is not considered"). */
const NEGATION =
  /(?<!\p{L})(не\s+(розгляда|рассматрива|пропону|предлага|передбач|предусмотр|можлив|возможн|підходить|подходит|практику)|немає|нет|без\s+(можливост|возможност))|\bnot\s+(possible|available|an option|considered|offered|allowed)\b/u;
/** "Only in the office", "with your presence in the office": office beats any other format the text mentions. */
const OFFICE_ONLY =
  /(тільки|лише|только|виключно|исключительно)\s+(в|у|з|із)\s+офіс|(тільки|лише|только|виключно|исключительно)\s+(в|из)\s+офис|присутніст\S*\s+(в|у)\s+офіс|присутстви\S*\s+в\s+офис|\boffice[-\s]only\b|\bon-?site only\b|\bonly (in the )?office\b/;

const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/\b(not|no|non)[-\s]+remote(ly)?\b/g, ' ')
    .replace(/\bremote[-\s]+control\b/g, ' ')
    .replace(/\b(hybrid[-\s]+cloud)\b/g, ' ')
    .replace(/\b(ms|microsoft)[-\s]+office\b|\boffice[-\s]?365\b/g, ' ');
const clauses = (text: string) => clean(text).split(/[.!?;,\n]+/);
const ruledOut = (clause: string) => (REMOTE_WORDS.test(clause) || HYBRID_WORDS.test(clause)) && NEGATION.test(clause);

/** True when the text rules remote work out ("remote is not considered", "only in the office"). */
export function remoteRuledOut(text: string): boolean {
  return clauses(text).some((c) => ruledOut(c) || OFFICE_ONLY.test(c));
}

export function detectRemote(text: string): 'remote' | 'hybrid' | 'office' | 'unknown' {
  const t = clauses(text)
    .filter((c) => !ruledOut(c))
    .join('. ');
  if (OFFICE_ONLY.test(t)) return 'office';
  if (HYBRID_WORDS.test(t)) return 'hybrid';
  if (REMOTE_WORDS.test(t)) return 'remote';
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
export const FX_TO_USD = { USD: 1, EUR: 1.08, UAH: 1 / 41.5, PLN: 0.25, GBP: 1.27 } as const;

/** Currencies we have no rate for: better no salary than a wrong one. Checked before `$` (R$, C$, A$). */
const UNSUPPORTED_CURRENCY =
  /\b(mxn|pln|gbp|chf|rub|rur|cad|aud|nzd|inr|brl|jpy|cny|rmb|sek|nok|dkk|czk|huf|ron|bgn|try|ils|zar|sgd|hkd|krw|kzt|gel|ars|cop|clp|php|idr|myr|thb|vnd|aed|sar|egp|ngn)\b|£|₽|₹|¥|₩|₪|₺|zł|\b(r|c|ca|a|au|nz|hk|s)\$|руб|злот/i;

const HOURLY = /\/\s*(hour|hr|h)\b|\bper\s+hour\b|\bhourly\b|\ban\s+hour\b|в\s+годину|за\s+годину|в\s+час\b|за\s+час\b|\/\s*год\b|\/\s*час\b/i;

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
    const k = Boolean(m[2]);
    // "35,3k" / "35.3k": a 1–2 digit fraction before k is a decimal, not a thousands separator.
    const decimal = k ? m[1]!.match(/^(\d+)[.,](\d{1,2})$/) : null;
    const digits = decimal
      ? `${decimal[1]}.${decimal[2]}`
      : m[1]!.replace(/[\s,]/g, '').replace(/\.(?=\d{3}\b)/g, '');
    const value = Number.parseFloat(digits);
    if (Number.isFinite(value)) found.push({ value, k });
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
  if (HOURLY.test(raw) || UNSUPPORTED_CURRENCY.test(raw)) return null;
  const values = numbers(raw);
  if (values.length === 0) return null;
  const rate = FX_TO_USD[detectCurrency(raw)];
  const t = raw.toLowerCase();
  const isUpTo = /(^|\s)(до|up to|to)\s/.test(t) && values.length === 1;
  const isFrom = /(^|\s)(від|от|from)\s/.test(t) && values.length === 1;

  let min: number | null = values[0]!;
  let max: number | null = values.length > 1 ? values[1]! : values[0]!;
  if (min > max) [min, max] = [max, min];
  if (isUpTo) min = null;
  if (isFrom) max = null;

  let annual = period === 'year' || (period !== 'month' && Math.max(...values) * rate > 20000);
  const toMonthlyUsd = (v: number | null): number | null => {
    if (v == null) return null;
    const usd = v * rate;
    return Math.round(annual ? usd / 12 : usd);
  };
  // Sanity guards against mislabelled periods and typos (sources are not always consistent).
  // A "yearly" salary under $500/month was almost certainly monthly already.
  if (annual && (toMonthlyUsd(max ?? min) ?? 0) < MIN_PLAUSIBLE_MONTHLY_USD) annual = false;
  // A range wider than 4x is likely a typo in the max (an extra digit); keep the min.
  if (min != null && max != null && min > 0 && max / min > MAX_RANGE_RATIO) max = null;
  const minUsd = toMonthlyUsd(min);
  const maxUsd = toMonthlyUsd(max);
  if ((minUsd ?? 0) > MAX_PLAUSIBLE_MONTHLY_USD || (maxUsd ?? 0) > MAX_PLAUSIBLE_MONTHLY_USD) return null;
  return { minUsd, maxUsd };
}

const MIN_PLAUSIBLE_MONTHLY_USD = 500;
export const MAX_PLAUSIBLE_MONTHLY_USD = 100_000;
export const MAX_RANGE_RATIO = 4;
