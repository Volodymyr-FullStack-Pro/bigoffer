import type { PrepPlan } from '@jp/ai';

/** A stored plan, or null when the row holds something else. */
export function asPlan(raw: unknown): PrepPlan | null {
  const p = raw as Partial<PrepPlan> | null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.topics) || typeof p.role !== 'string') return null;
  return {
    role: p.role,
    summary: typeof p.summary === 'string' ? p.summary : '',
    expectations: Array.isArray(p.expectations) ? p.expectations.filter((e): e is string => typeof e === 'string') : [],
    topics: p.topics.filter((t) => t && typeof t.key === 'string' && typeof t.title === 'string'),
  };
}

/** Cards worth preparing for: an interview or a test task is on the way. */
export const PREP_COLUMNS = ['talking', 'test_task', 'interview', 'offer'] as const;
