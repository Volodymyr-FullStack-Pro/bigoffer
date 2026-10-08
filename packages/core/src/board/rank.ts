import { generateKeyBetween } from 'fractional-indexing';

/** A key strictly between two neighbours (null = open end). Compare keys byte-wise (Postgres: collate "C"). */
export function rankBetween(prev: string | null, next: string | null): string {
  if (prev !== null && next !== null && prev >= next) {
    throw new Error(`rankBetween: prev (${prev}) must be strictly less than next (${next})`);
  }
  return generateKeyBetween(prev, next);
}

export const rankAtTop = (first: string | null): string => rankBetween(null, first);
export const rankAtEnd = (last: string | null): string => rankBetween(last, null);
