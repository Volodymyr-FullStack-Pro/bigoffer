/** Application analytics from the board, computed in the user's time zone. Pure, so it is unit-tested. */

export type AppRow = {
  column: string;
  appliedAt: string | null;
  firstResponseAt: string | null;
  outcome: string;
  sourceId: string | null;
  rejectionReasons: string[];
};

export type Stats = {
  applied7: number;
  applied30: number;
  responseRate: number | null;
  interviews: number;
  offers: number;
  funnel: { saved: number; applied: number; responded: number; interview: number; offer: number };
  days: { date: string; count: number }[];
  sources: { id: string; applied: number; responded: number }[];
  reasons: { key: string; count: number }[];
};

const INTERVIEW = new Set(['test_task', 'interview', 'offer']);

function localDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function computeStats(rows: readonly AppRow[], now: Date, tz: string, days = 14): Stats {
  const ms = now.getTime();
  // Anything past "saved" was applied to, even when the card was moved without an applied date.
  const applied = rows.filter((r) => r.appliedAt || r.column !== 'saved');
  const within = (iso: string, d: number) => ms - Date.parse(iso) <= d * 86_400_000;
  const responded = applied.filter((r) => r.firstResponseAt || r.column === 'talking' || INTERVIEW.has(r.column) || r.outcome === 'offer');
  const interview = rows.filter((r) => INTERVIEW.has(r.column) || r.outcome === 'offer');
  const offers = rows.filter((r) => r.column === 'offer' || r.outcome === 'offer');

  const perDay = new Map<string, number>();
  for (const r of applied) if (r.appliedAt) perDay.set(localDate(r.appliedAt, tz), (perDay.get(localDate(r.appliedAt, tz)) ?? 0) + 1);
  const series = Array.from({ length: days }, (_, i) => {
    const date = localDate(new Date(ms - (days - 1 - i) * 86_400_000).toISOString(), tz);
    return { date, count: perDay.get(date) ?? 0 };
  });

  const bySource = new Map<string, { applied: number; responded: number }>();
  for (const r of applied) {
    const id = r.sourceId ?? 'manual';
    const s = bySource.get(id) ?? { applied: 0, responded: 0 };
    s.applied++;
    if (responded.includes(r)) s.responded++;
    bySource.set(id, s);
  }
  const reasons = new Map<string, number>();
  for (const r of rows) for (const k of r.rejectionReasons) reasons.set(k, (reasons.get(k) ?? 0) + 1);

  return {
    applied7: applied.filter((r) => r.appliedAt && within(r.appliedAt, 7)).length,
    applied30: applied.filter((r) => r.appliedAt && within(r.appliedAt, 30)).length,
    responseRate: applied.length > 0 ? Math.round((100 * responded.length) / applied.length) : null,
    interviews: interview.length,
    offers: offers.length,
    funnel: { saved: rows.length, applied: applied.length, responded: responded.length, interview: interview.length, offer: offers.length },
    days: series,
    sources: [...bySource].map(([id, s]) => ({ id, ...s })).sort((a, b) => b.applied - a.applied).slice(0, 6),
    reasons: [...reasons].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 6),
  };
}
