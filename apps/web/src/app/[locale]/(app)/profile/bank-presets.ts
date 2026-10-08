import type { BankKey } from '@jp/core';

/** Ready-made answers for the standard bank keys. Values are stored as plain strings, in English (forms are mostly English). */
export const BANK_PRESETS: Partial<Record<BankKey, readonly string[]>> = {
  english: ['A2', 'B1', 'B2 (Upper-Intermediate)', 'C1 (Advanced)', 'C2 (Proficient)', 'Native'],
  start_date: ['Immediately', 'In 1 week', 'In 2 weeks', 'In 1 month'],
  work_format: ['Remote', 'Hybrid', 'Office', 'Remote or hybrid'],
};

/** Bank keys answered in free text that get an example placeholder (message key `ph_<key>`). */
export const BANK_PLACEHOLDER_KEYS: readonly BankKey[] = ['salary', 'why_looking'];

export const OTHER = '__other__';

export function presetsFor(key: string): readonly string[] | null {
  return (BANK_PRESETS as Record<string, readonly string[] | undefined>)[key] ?? null;
}

/** Which select option shows a stored answer: the matching preset, '' when empty, otherwise "Other…". */
export function presetChoice(key: string, value: string): string {
  const presets = presetsFor(key);
  const v = value.trim();
  if (!presets || !v) return '';
  return presets.find((p) => p.toLowerCase() === v.toLowerCase()) ?? OTHER;
}
