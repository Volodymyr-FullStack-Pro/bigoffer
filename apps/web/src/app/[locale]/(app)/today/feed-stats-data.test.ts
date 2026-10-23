import { describe, expect, it } from 'vitest';
import { feedStats } from './feed-stats-data';

const now = Date.parse('2026-10-22T12:00:00Z');
const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

describe('feedStats', () => {
  it('counts strong fresh matches, unapplied saves, 14-day silences and this week', () => {
    const out = feedStats(
      [
        { score: 90, firstSeenAt: ago(0.5) },
        { score: 90, firstSeenAt: ago(2) },
        { score: 70, firstSeenAt: ago(0.1) },
      ],
      [
        { applied_at: null, first_response_at: null, outcome: 'open' },
        { applied_at: ago(20), first_response_at: null, outcome: 'open' },
        { applied_at: ago(20), first_response_at: ago(19), outcome: 'open' },
        { applied_at: ago(3), first_response_at: null, outcome: 'open' },
        { applied_at: ago(30), first_response_at: null, outcome: 'rejected' },
      ],
      now,
    );
    expect(out).toEqual({ strong: 1, saved: 1, silent: 1, week: 1 });
  });
});
