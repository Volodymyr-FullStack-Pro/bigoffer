import { businessDaysBetween } from './business-days';

export const URGENCIES = ['interview_soon', 'overdue', 'ghosting', 'ping', 'fresh', 'none'] as const;
export type Urgency = (typeof URGENCIES)[number];

export type UrgencyInput = {
  columnKind: 'active' | 'won' | 'lost';
  outcome: string;
  appliedAt: Date | null;
  firstResponseAt: Date | null;
  lastActivityAt: Date | null;
  nextActionAt: Date | null;
};

export type FollowUpRules = { followUpDays: number[]; ghostAfterDays: number };
export const DEFAULT_FOLLOW_UP: FollowUpRules = { followUpDays: [5, 10], ghostAfterDays: 21 };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function applicationUrgency(a: UrgencyInput, now: Date, rules: FollowUpRules = DEFAULT_FOLLOW_UP): Urgency {
  if (a.columnKind !== 'active' || a.outcome !== 'open') return 'none';
  if (a.nextActionAt) {
    const until = a.nextActionAt.getTime() - now.getTime();
    if (until >= 0 && until <= 48 * HOUR) return 'interview_soon';
  }
  if (!a.appliedAt) return 'none';
  if (a.firstResponseAt) return 'fresh';
  if ((now.getTime() - a.appliedAt.getTime()) / DAY >= rules.ghostAfterDays) return 'ghosting';
  // A ping (last_activity_at) restarts the follow-up timer.
  const since = a.lastActivityAt && a.lastActivityAt > a.appliedAt ? a.lastActivityAt : a.appliedAt;
  const days = businessDaysBetween(since, now);
  const [first = DEFAULT_FOLLOW_UP.followUpDays[0]!, rawSecond = DEFAULT_FOLLOW_UP.followUpDays[1]!] = rules.followUpDays;
  const second = Math.max(first, rawSecond); // a misordered pair must not mark overdue before the first ping
  if (days >= second) return 'overdue';
  if (days >= first) return 'ping';
  return 'fresh';
}

export const NEEDS_ACTION: ReadonlySet<Urgency> = new Set(['interview_soon', 'overdue', 'ghosting', 'ping']);

const PRIORITY: Record<Urgency, number> = { interview_soon: 0, overdue: 1, ghosting: 2, ping: 3, fresh: 4, none: 5 };
const byRank = (a: { rank: string }, b: { rank: string }) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

export function smartSort<T extends { rank: string; urgency: Urgency }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => PRIORITY[a.urgency] - PRIORITY[b.urgency] || byRank(a, b));
}

export function columnCounters(cards: { urgency: Urgency }[]): { total: number; needsAction: number } {
  return { total: cards.length, needsAction: cards.filter((c) => NEEDS_ACTION.has(c.urgency)).length };
}

export type TodayAction = { id: string; kind: 'interview' | 'ping' | 'ghosting'; urgency: Urgency; at: Date | null };

export function todayActions(cards: { id: string; urgency: Urgency; nextActionAt: Date | null }[]): TodayAction[] {
  const interviews = cards
    .filter((c) => c.urgency === 'interview_soon')
    .sort((a, b) => (a.nextActionAt?.getTime() ?? 0) - (b.nextActionAt?.getTime() ?? 0))
    .map((c): TodayAction => ({ id: c.id, kind: 'interview', urgency: c.urgency, at: c.nextActionAt }));
  const pings = [...cards.filter((c) => c.urgency === 'overdue'), ...cards.filter((c) => c.urgency === 'ping')].map(
    (c): TodayAction => ({ id: c.id, kind: 'ping', urgency: c.urgency, at: null }),
  );
  const ghosts = cards
    .filter((c) => c.urgency === 'ghosting')
    .map((c): TodayAction => ({ id: c.id, kind: 'ghosting', urgency: c.urgency, at: null }));
  return [...interviews, ...pings, ...ghosts];
}
