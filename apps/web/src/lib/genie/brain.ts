/**
 * Offer Genie's brain: from the user's state and the page they are on, pick at most one thing worth saying now.
 * Pure (no I/O): the component feeds it data and a memory of what was already said.
 */

export type GenieMode = 'on' | 'quiet' | 'off';

export type GenieState = {
  mode: GenieMode;
  goal: number;
  appliedToday: number;
  /** Consecutive past days (yesterday backwards) that met the goal. */
  streak: number;
  /** Consecutive past days (yesterday backwards) without a single application. */
  idleDays: number;
  /** Local hour 0–23 in the user's timezone. */
  hour: number;
  hasProfile: boolean;
  profileActive: boolean;
  /** Main boards not polled successfully in the last 3 hours (names). */
  staleSources: string[];
  /** Minutes since the freshest successful run of a main board; null when none yet. */
  lastRunMinutes: number | null;
  newMatches24h: number;
  /** New strong matches (score ≥ 80) found in the last 2 hours. */
  hotMatches: number;
  ruleHidden: number;
  /** Applications waiting 5+ days in "Applied" without any reply. */
  waitingReplies: number;
  /** First name for a greeting; empty when unknown. */
  firstName: string;
  /** A parsed CV is on file (letters, form answers and matching depend on it). */
  hasCv: boolean;
  /** Interviews or test tasks whose next step is due within 24 hours. */
  interviewsSoon: number;
  /** Board cards saved 2+ days ago and still not applied to. */
  savedWaiting: number;
  /** The Telegram bot is linked (alerts reach the user within minutes). */
  telegramLinked: boolean;
  /** Cards where the company answered and waits for the candidate (question, invite to book, test task, offer). */
  yourMove: number;
};

export type GenieMood = 'happy' | 'neutral' | 'worried' | 'excited';

export type GenieMessage = {
  /** Stable id: what was already said (and when) is remembered by it. */
  id: string;
  kind: 'celebrate' | 'health' | 'goal' | 'tip' | 'motivation';
  mood: GenieMood;
  key: string;
  params?: Record<string, string | number>;
  action?: { href: string; labelKey: string };
};

export type GenieMemory = {
  /** message id → last time shown (ms). */
  shown: Record<string, number>;
  lastMotivationAt: number;
};

export type GenieRoute = 'today' | 'search' | 'board' | 'profile' | 'other';

/** Page-provided hint (e.g. the search form's tips count). */
export type GeniePageHint = { key: string; params?: Record<string, string | number>; action?: GenieMessage['action'] } | null;

const HOUR = 3600_000;
const DAY = 24 * HOUR;
export const MOTIVATION_COUNT = 30;
/** How-to tips about BigOffer itself, shown between mottos. */
export const FEATURE_TIP_COUNT = 12;
const FEATURE_TIP_ACTIONS: Record<number, GenieMessage['action']> = {
  0: { href: '/board', labelKey: 'actBoard' },
  1: { href: '/board', labelKey: 'actBoard' },
  3: { href: '/today?fresh=1', labelKey: 'actFresh' },
  5: { href: '/search', labelKey: 'actSetup' },
  8: { href: '/analytics', labelKey: 'actProgress' },
  10: { href: '/profile#telegram', labelKey: 'actConnect' },
};
// Owner's choice (2026-10-13, then "more often"): something light every 5 minutes when nothing more useful is due,
// rotating a motto, a BigOffer tip and the day's progress.
const MOTIVATION_EVERY = 5 * 60_000;

const daily = (id: string, mem: GenieMemory, now: number, every = DAY) => now - (mem.shown[id] ?? 0) >= every;

export function routeOf(pathname: string): GenieRoute {
  const seg = pathname.split('/').filter(Boolean)[1] ?? '';
  return seg === 'today' || seg === 'search' || seg === 'board' || seg === 'profile' ? seg : 'other';
}

/**
 * Priority: broken setup > urgent goal nudges > fresh hot matches > page hints > daily "all good" > motivation.
 * Quiet mode keeps only setup problems and goal messages; off says nothing.
 */
export function pickMessage(
  s: GenieState,
  route: GenieRoute,
  mem: GenieMemory,
  now: number,
  hint: GeniePageHint = null,
): GenieMessage | null {
  if (s.mode === 'off') return null;
  const quiet = s.mode === 'quiet';
  const candidates: GenieMessage[] = [];

  // 1. Setup / health problems.
  if (!s.hasProfile) {
    candidates.push({ id: 'health:noProfile', kind: 'health', mood: 'worried', key: 'noProfile', action: { href: '/search', labelKey: 'actSetup' } });
  } else if (!s.profileActive) {
    candidates.push({ id: 'health:inactive', kind: 'health', mood: 'worried', key: 'inactive', action: { href: '/search', labelKey: 'actSetup' } });
  } else if (s.staleSources.length > 0) {
    candidates.push({ id: `health:stale:${s.staleSources.join(',')}`, kind: 'health', mood: 'worried', key: 'stale', params: { sources: s.staleSources.join(', ') } });
  }
  if (s.hasProfile && !s.hasCv) {
    candidates.push({ id: 'setup:noCv', kind: 'health', mood: 'worried', key: 'noCv', action: { href: '/profile', labelKey: 'actCv' } });
  }

  // An interview or test task within a day beats everything but broken setup.
  if (s.interviewsSoon > 0) {
    candidates.push({ id: `goal:interview:${dayKey(now)}`, kind: 'goal', mood: 'excited', key: 'interviewSoon', params: { count: s.interviewsSoon }, action: { href: '/board#today-actions', labelKey: 'actPrepare' } });
  }

  // The company waits for an answer: replying fast is the cheapest edge there is.
  if (s.yourMove > 0) {
    candidates.push({ id: `move:${s.yourMove}:${Math.floor(now / (3 * HOUR))}`, kind: 'goal', mood: 'excited', key: 'yourMove', params: { count: s.yourMove }, action: { href: '/board#today-actions', labelKey: 'actAnswer' } });
  }

  // 2. Daily goal.
  const left = Math.max(0, s.goal - s.appliedToday);
  if (s.hasProfile) {
    if (left === 0) {
      candidates.push({ id: `goal:done:${dayKey(now)}`, kind: 'goal', mood: 'excited', key: s.streak > 0 ? 'goalDoneStreak' : 'goalDone', params: { goal: s.goal, streak: s.streak + 1 }, action: { href: '/analytics', labelKey: 'actProgress' } });
    } else if (s.idleDays >= 2) {
      candidates.push({ id: `goal:idle:${dayKey(now)}`, kind: 'goal', mood: 'worried', key: 'idle', params: { days: s.idleDays }, action: { href: '/today', labelKey: 'actFeed' } });
    } else if (s.hour >= 17 && left > 0) {
      candidates.push({ id: `goal:evening:${dayKey(now)}`, kind: 'goal', mood: 'neutral', key: 'evening', params: { left, hot: s.hotMatches }, action: { href: '/today', labelKey: 'actFeed' } });
    }
  }

  // 3. Fresh strong matches: the first ten applicants get the replies.
  if (!quiet && s.hotMatches > 0 && route !== 'today') {
    candidates.push({ id: `hot:${s.hotMatches}:${Math.floor(now / (2 * HOUR))}`, kind: 'tip', mood: 'excited', key: 'hot', params: { count: s.hotMatches }, action: { href: '/today?fresh=1', labelKey: 'actFresh' } });
  }

  // 4. What the current page can do better.
  if (!quiet) {
    if (hint) candidates.push({ id: `hint:${route}:${hint.key}`, kind: 'tip', mood: 'neutral', key: hint.key, params: hint.params, action: hint.action });
    if (route === 'today' && s.ruleHidden >= 10) candidates.push({ id: 'tip:ruleHidden', kind: 'tip', mood: 'neutral', key: 'ruleHidden', params: { count: s.ruleHidden }, action: { href: '/today?view=hidden', labelKey: 'actShowHidden' } });
    if (s.savedWaiting > 0) candidates.push({ id: 'tip:saved', kind: 'tip', mood: 'neutral', key: 'savedWaiting', params: { count: s.savedWaiting }, action: { href: '/board', labelKey: 'actBoard' } });
    if (s.waitingReplies > 0) candidates.push({ id: 'tip:followUp', kind: 'tip', mood: 'neutral', key: 'followUp', params: { count: s.waitingReplies }, action: { href: '/board#today-actions', labelKey: 'actFollowUp' } });
    if (s.hasProfile && s.profileActive && !s.telegramLinked) candidates.push({ id: 'weekly:telegram', kind: 'tip', mood: 'neutral', key: 'connectTelegram', action: { href: '/profile#telegram', labelKey: 'actConnect' } });
  }

  // 5. Daily "everything works" report.
  if (s.hasProfile && s.profileActive && s.staleSources.length === 0 && s.lastRunMinutes !== null) {
    // The first message of the day greets by name and reports.
    const greet = s.hour < 12 ? 'Morning' : s.hour < 18 ? 'Day' : 'Evening';
    candidates.push({ id: `health:ok:${dayKey(now)}`, kind: 'health', mood: 'happy', key: s.firstName ? `allGood${greet}` : 'allGood', params: { found: s.newMatches24h, minutes: s.lastRunMinutes, name: s.firstName }, action: s.newMatches24h > 0 ? { href: '/today', labelKey: 'actFeed' } : undefined });
  }

  const once = { 'health:ok': DAY, goal: DAY, hint: 6 * HOUR, tip: DAY, hot: 2 * HOUR, health: 3 * HOUR } as const;
  const every = (m: GenieMessage) =>
    m.id.startsWith('health:ok') || m.id.startsWith('setup:')
      ? DAY
      : m.id.startsWith('weekly:')
        ? 7 * DAY
        : m.id.startsWith('hint')
          ? once.hint
          : m.id.startsWith('hot')
            ? once.hot
            : once[m.kind as 'goal' | 'tip' | 'health'] ?? DAY;
  const fresh = candidates.find((m) => daily(m.id, mem, now, every(m)));
  if (fresh) return fresh;

  // 6. Light chatter when nothing else is worth saying: a motto, a BigOffer tip, the day's progress in turn.
  if (!quiet && now - mem.lastMotivationAt >= MOTIVATION_EVERY) return chatter(s, now);
  return null;
}

/** The light line for this 5-minute slot. */
export function chatter(s: GenieState, now: number): GenieMessage {
  const slot = Math.floor(now / MOTIVATION_EVERY);
  const turn = slot % 3;
  if (turn === 1) {
    const i = Math.floor(slot / 3) % FEATURE_TIP_COUNT;
    return { id: `motivation:feat${i}`, kind: 'motivation', mood: 'neutral', key: `feat${i}`, action: FEATURE_TIP_ACTIONS[i] };
  }
  if (turn === 2 && s.hasProfile) {
    const left = Math.max(0, s.goal - s.appliedToday);
    return { id: `motivation:progress:${slot}`, kind: 'motivation', mood: left === 0 ? 'excited' : 'happy', key: left === 0 ? 'progressDone' : s.appliedToday === 0 ? 'progressNone' : 'progress', params: { done: s.appliedToday, goal: s.goal, left }, action: left > 0 ? { href: '/today', labelKey: 'actFeed' } : undefined };
  }
  const i = Math.floor(slot / 3) % MOTIVATION_COUNT;
  return { id: `motivation:${i}`, kind: 'motivation', mood: 'happy', key: `motto${i}` };
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export { streaks } from '@jp/core';
