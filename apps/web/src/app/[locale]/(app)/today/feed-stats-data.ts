const DAY = 86_400_000;

/** The four numbers over the feed, counted at request time (kept out of render: it reads the clock). */
export function feedStats(
  matches: readonly { score: number; firstSeenAt: string }[],
  apps: readonly { applied_at: string | null; first_response_at: string | null; outcome: string }[],
  now = Date.now(),
): { strong: number; saved: number; silent: number; week: number } {
  return {
    strong: matches.filter((m) => m.score >= 80 && Date.parse(m.firstSeenAt) > now - DAY).length,
    saved: apps.filter((a) => a.outcome === 'open' && !a.applied_at).length,
    silent: apps.filter((a) => a.outcome === 'open' && a.applied_at && !a.first_response_at && Date.parse(a.applied_at) < now - 14 * DAY).length,
    week: apps.filter((a) => a.applied_at && Date.parse(a.applied_at) > now - 7 * DAY).length,
  };
}
