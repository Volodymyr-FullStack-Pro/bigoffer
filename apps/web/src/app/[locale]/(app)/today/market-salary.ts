import { detectRoleFamily, type RoleFamily } from '@jp/core';

export type MarketBand = { p25: number; median: number; p75: number; n: number };
export type MarketPoint = { title: string; role: string | null; seniority: string | null; usd: number };

/** Fewer stated salaries than this for a role and level and the band says nothing reliable. */
export const MARKET_MIN = 6;

const quantile = (sorted: readonly number[], q: number) => {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return Math.round(sorted[lo]! + (sorted[Math.ceil(i)]! - sorted[lo]!) * (i - lo));
};

/** Pay bands per role family and level ("fullstack:middle"), from the stated salaries of recent jobs. */
export function marketBands(points: readonly MarketPoint[]): Map<string, MarketBand> {
  const groups = new Map<string, number[]>();
  for (const p of points) {
    const family = detectRoleFamily(p.title, p.role);
    if (!family || !p.seniority) continue;
    const key = `${family}:${p.seniority}`;
    groups.set(key, [...(groups.get(key) ?? []), p.usd]);
  }
  const bands = new Map<string, MarketBand>();
  for (const [key, values] of groups) {
    if (values.length < MARKET_MIN) continue;
    const s = [...values].sort((a, b) => a - b);
    bands.set(key, { p25: quantile(s, 0.25), median: quantile(s, 0.5), p75: quantile(s, 0.75), n: s.length });
  }
  return bands;
}

export function marketKey(title: string, role: string | null, seniority: string | null): string | null {
  const family: RoleFamily | null = detectRoleFamily(title, role);
  return family && seniority ? `${family}:${seniority}` : null;
}
