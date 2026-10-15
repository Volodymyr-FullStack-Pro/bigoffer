/**
 * How many times its board's interval a query waits before its next run. A query whose recent runs found nothing new
 * (most search synonyms return the same latest postings) is checked less often: ×2 after 3 empty runs in a row, ×4
 * after 6, never beyond the board's cap. One new job resets it.
 *
 * `recentInserted` holds the new-job counts of the latest runs, newest first (the run just finished included).
 */
export function queryBackoff(recentInserted: number[], maxFactor: number): number {
  let empty = 0;
  for (const n of recentInserted) {
    if (n > 0) break;
    empty++;
  }
  const factor = empty >= 6 ? 4 : empty >= 3 ? 2 : 1;
  return Math.max(1, Math.min(factor, maxFactor));
}

/** Per board: Djinni is the main source and stays on its interval; DOU waits up to 1 h, robota.ua (little IT) up to 4 h. */
export const MAX_BACKOFF: Record<string, number> = { djinni: 1, dou: 2, robotaua: 4 };
export const DEFAULT_MAX_BACKOFF = 4;

/** A readable message for any thrown value (Supabase errors are plain objects, not Error). */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown };
    if (typeof e.message === 'string') return [e.code, e.message, e.details].filter((x) => typeof x === 'string' && x).join(': ');
    try {
      return JSON.stringify(err).slice(0, 500);
    } catch {
      return 'unknown error';
    }
  }
  return String(err);
}
