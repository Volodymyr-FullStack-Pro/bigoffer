import { describe, expect, it } from 'vitest';
import { rankAtEnd, rankAtTop, rankBetween } from './rank';

describe('rank', () => {
  it('orders keys byte-wise between neighbours', () => {
    const a = rankAtEnd(null);
    const b = rankAtEnd(a);
    const top = rankAtTop(a);
    const mid = rankBetween(a, b);
    expect([b, mid, top, a].sort()).toEqual([top, a, mid, b]);
  });
  it('rejects reversed neighbours', () => {
    expect(() => rankBetween('a1', 'a0')).toThrow();
  });
});
