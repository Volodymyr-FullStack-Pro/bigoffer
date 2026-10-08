import { FX_TO_USD, MAX_PLAUSIBLE_MONTHLY_USD, MAX_RANGE_RATIO } from './detect';

export const SALARY_PERIODS = ['hour', 'month', 'year'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

/** A salary already split into numbers by someone else (e.g. the AI enrichment), in the posting's currency. */
export type StructuredSalary = {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
};

const HOURS_PER_MONTH = 168;
/** Below this a "monthly" figure is a misread (hourly, thousands, typo); low-wage boards still clear it. */
const MIN_MONTHLY_USD = 100;

export function salaryToMonthlyUsd(s: StructuredSalary): { minUsd: number | null; maxUsd: number | null } | null {
  const code = s.currency?.trim().toUpperCase();
  const rate = code && Object.hasOwn(FX_TO_USD, code) ? FX_TO_USD[code as keyof typeof FX_TO_USD] : undefined;
  if (rate === undefined) return null;
  const factor = s.period === 'hour' ? HOURS_PER_MONTH : s.period === 'year' ? 1 / 12 : 1;
  const convert = (v: number | null) => (v != null && Number.isFinite(v) && v > 0 ? Math.round(v * rate * factor) : null);

  let minUsd = convert(s.min);
  let maxUsd = convert(s.max);
  if (minUsd == null && maxUsd == null) return null;
  if (minUsd != null && maxUsd != null && minUsd > maxUsd) [minUsd, maxUsd] = [maxUsd, minUsd];
  if (minUsd != null && maxUsd != null && maxUsd / minUsd > MAX_RANGE_RATIO) maxUsd = null;
  const values = [minUsd, maxUsd].filter((v): v is number => v != null);
  if (values.some((v) => v < MIN_MONTHLY_USD || v > MAX_PLAUSIBLE_MONTHLY_USD)) return null;
  return { minUsd, maxUsd };
}
