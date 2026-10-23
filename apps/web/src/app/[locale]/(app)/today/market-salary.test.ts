import { describe, expect, it } from 'vitest';
import { MARKET_MIN, marketBands, marketKey } from './market-salary';

const p = (title: string, usd: number, seniority = 'middle') => ({ title, role: null, seniority, usd });

describe('marketBands', () => {
  it('gives quartiles per role and level once there are enough salaries', () => {
    const pts = [1000, 2000, 3000, 4000, 5000, 6000, 7000].map((v) => p('Full Stack Developer', v));
    const band = marketBands(pts).get('fullstack:middle');
    expect(band).toEqual({ p25: 2500, median: 4000, p75: 5500, n: 7 });
  });

  it('stays quiet below the minimum and without a level', () => {
    const pts = Array.from({ length: MARKET_MIN - 1 }, () => p('Frontend Developer', 2000));
    expect(marketBands(pts).size).toBe(0);
    expect(marketKey('Frontend Developer', null, null)).toBeNull();
  });
});
