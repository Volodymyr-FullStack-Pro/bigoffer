import { businessDaysBetween } from './business-days';

export const URGENCIES = ['interview_soon', 'your_move', 'step_passed', 'feedback_due', 'overdue', 'ghosting', 'ping', 'awaiting_feedback', 'fresh', 'none'] as const;
export type Urgency = (typeof URGENCIES)[number];

export type UrgencyInput = {
  columnKind: 'active' | 'won' | 'lost';
  outcome: string;
  appliedAt: Date | null;
  firstResponseAt: Date | null;
  lastActivityAt: Date | null;
  nextActionAt: Date | null;
  /** The latest logged message: who spoke last decides whose move it is. */
  lastMessage?: { direction: 'in' | 'out'; at: Date } | null;
  /** What the latest recruiter reply was (auto_reply, question, interview_invite, test_task, offer, …). */
  replyKind?: string | null;
  /** After an interview: when the company promised feedback (cleared by their reply or a reminder). */
  feedbackDueAt?: Date | null;
};

/** Replies that wait for the candidate: an answer, a booking, a test, a decision. */
const YOUR_MOVE = new Set(['question', 'interview_invite', 'test_task', 'offer']);

export type FollowUpRules = { followUpDays: number[]; ghostAfterDays: number };
export const DEFAULT_FOLLOW_UP: FollowUpRules = { followUpDays: [5, 10], ghostAfterDays: 21 };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * What a card needs now, most pressing first:
 * interview_soon — the next step (interview, deadline) is within 48 hours;
 * your_move — the company answered and waits for the candidate (question, invite to book, test, offer);
 * awaiting_feedback / feedback_due — after an interview, waiting calmly until the promised feedback date, then remind;
 * step_passed — the planned step is over and nothing was logged since: update the status;
 * ping / overdue / ghosting — waiting on the company for too long (follow-up rules, business days).
 * An automatic acknowledgement is not a reply: the follow-up clock keeps running.
 */
export function applicationUrgency(a: UrgencyInput, now: Date, rules: FollowUpRules = DEFAULT_FOLLOW_UP): Urgency {
  if (a.columnKind !== 'active' || a.outcome !== 'open') return 'none';
  if (a.nextActionAt) {
    const until = a.nextActionAt.getTime() - now.getTime();
    if (until >= 0 && until <= 48 * HOUR) return 'interview_soon';
  }
  // The interview is behind: no "your move" for its invite and no ping clock until the promised date.
  if (a.feedbackDueAt) return a.feedbackDueAt.getTime() > now.getTime() ? 'awaiting_feedback' : 'feedback_due';
  if (a.nextActionAt) {
    const until = a.nextActionAt.getTime() - now.getTime();
    const loggedSince = a.lastActivityAt && a.lastActivityAt > a.nextActionAt;
    if (until < -HOUR && !loggedSince) return 'step_passed';
  }
  const theirs = a.lastMessage?.direction === 'in';
  const planned = a.nextActionAt !== null && a.nextActionAt.getTime() > now.getTime();
  if (theirs && a.replyKind && YOUR_MOVE.has(a.replyKind) && !planned) return 'your_move';
  if (!a.appliedAt) return 'none';
  const [first = DEFAULT_FOLLOW_UP.followUpDays[0]!, rawSecond = DEFAULT_FOLLOW_UP.followUpDays[1]!] = rules.followUpDays;
  const second = Math.max(first, rawSecond); // a misordered pair must not mark overdue before the first ping
  if (a.firstResponseAt) {
    // A real conversation went quiet: follow up counting from its last step (their reply, your message or ping).
    if (planned) return 'fresh';
    const marks = [a.firstResponseAt, a.lastActivityAt, a.lastMessage?.at ?? null].filter((d): d is Date => d !== null);
    const since = new Date(Math.max(...marks.map((d) => d.getTime())));
    const days = businessDaysBetween(since, now);
    if ((now.getTime() - since.getTime()) / DAY >= rules.ghostAfterDays) return 'ghosting';
    return days >= second ? 'overdue' : days >= first ? 'ping' : 'fresh';
  }
  if ((now.getTime() - a.appliedAt.getTime()) / DAY >= rules.ghostAfterDays) return 'ghosting';
  // A ping (last_activity_at) restarts the follow-up timer.
  const since = a.lastActivityAt && a.lastActivityAt > a.appliedAt ? a.lastActivityAt : a.appliedAt;
  const days = businessDaysBetween(since, now);
  if (days >= second) return 'overdue';
  if (days >= first) return 'ping';
  return 'fresh';
}

export const NEEDS_ACTION: ReadonlySet<Urgency> = new Set(['interview_soon', 'your_move', 'step_passed', 'feedback_due', 'overdue', 'ghosting', 'ping']);

const PRIORITY: Record<Urgency, number> = { interview_soon: 0, your_move: 1, step_passed: 2, feedback_due: 3, overdue: 4, ghosting: 5, ping: 6, awaiting_feedback: 7, fresh: 8, none: 9 };
const byRank = (a: { rank: string }, b: { rank: string }) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

export function smartSort<T extends { rank: string; urgency: Urgency }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => PRIORITY[a.urgency] - PRIORITY[b.urgency] || byRank(a, b));
}

export function columnCounters(cards: { urgency: Urgency }[]): { total: number; needsAction: number } {
  return { total: cards.length, needsAction: cards.filter((c) => NEEDS_ACTION.has(c.urgency)).length };
}

export type TodayAction = { id: string; kind: 'interview' | 'answer' | 'status' | 'feedback' | 'ping' | 'ghosting'; urgency: Urgency; at: Date | null };

export function todayActions(cards: { id: string; urgency: Urgency; nextActionAt: Date | null }[]): TodayAction[] {
  const interviews = cards
    .filter((c) => c.urgency === 'interview_soon')
    .sort((a, b) => (a.nextActionAt?.getTime() ?? 0) - (b.nextActionAt?.getTime() ?? 0))
    .map((c): TodayAction => ({ id: c.id, kind: 'interview', urgency: c.urgency, at: c.nextActionAt }));
  const answers = cards.filter((c) => c.urgency === 'your_move').map((c): TodayAction => ({ id: c.id, kind: 'answer', urgency: c.urgency, at: null }));
  const statuses = cards.filter((c) => c.urgency === 'step_passed').map((c): TodayAction => ({ id: c.id, kind: 'status', urgency: c.urgency, at: c.nextActionAt }));
  const feedback = cards.filter((c) => c.urgency === 'feedback_due').map((c): TodayAction => ({ id: c.id, kind: 'feedback', urgency: c.urgency, at: null }));
  const pings = [...cards.filter((c) => c.urgency === 'overdue'), ...cards.filter((c) => c.urgency === 'ping')].map(
    (c): TodayAction => ({ id: c.id, kind: 'ping', urgency: c.urgency, at: null }),
  );
  const ghosts = cards
    .filter((c) => c.urgency === 'ghosting')
    .map((c): TodayAction => ({ id: c.id, kind: 'ghosting', urgency: c.urgency, at: null }));
  return [...interviews, ...answers, ...statuses, ...feedback, ...pings, ...ghosts];
}
