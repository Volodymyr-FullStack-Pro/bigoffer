const DAY = 24 * 60 * 60 * 1000;

/** Weekdays (Mon–Fri, UTC dates) after `from` up to and including `to`; 0 when `to` is not later. */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  let count = 0;
  for (let t = start + DAY; t <= end; t += DAY) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}
