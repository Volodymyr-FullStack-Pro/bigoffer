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
export type GeniePageHint = { key: string; params?: Record<string, string | number> } | null;

const HOUR = 3600_000;
const DAY = 24 * HOUR;
export const MOTIVATION_COUNT = 30;
const MOTIVATION_EVERY = 20 * 60_000;

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

  // 2. Daily goal.
  const left = Math.max(0, s.goal - s.appliedToday);
  if (s.hasProfile) {
    if (left === 0) {
      candidates.push({ id: `goal:done:${dayKey(now)}`, kind: 'goal', mood: 'excited', key: s.streak > 0 ? 'goalDoneStreak' : 'goalDone', params: { goal: s.goal, streak: s.streak + 1 } });
    } else if (s.idleDays >= 2) {
      candidates.push({ id: `goal:idle:${dayKey(now)}`, kind: 'goal', mood: 'worried', key: 'idle', params: { days: s.idleDays }, action: { href: '/today', labelKey: 'actFeed' } });
    } else if (s.hour >= 17 && left > 0) {
      candidates.push({ id: `goal:evening:${dayKey(now)}`, kind: 'goal', mood: 'neutral', key: 'evening', params: { left, hot: s.hotMatches }, action: { href: '/today', labelKey: 'actFeed' } });
    }
  }

  // 3. Fresh strong matches: the first ten applicants get the replies.
  if (!quiet && s.hotMatches > 0 && route !== 'today') {
    candidates.push({ id: `hot:${s.hotMatches}:${Math.floor(now / (2 * HOUR))}`, kind: 'tip', mood: 'excited', key: 'hot', params: { count: s.hotMatches }, action: { href: '/today', labelKey: 'actFeed' } });
  }

  // 4. What the current page can do better.
  if (!quiet) {
    if (hint) candidates.push({ id: `hint:${route}:${hint.key}`, kind: 'tip', mood: 'neutral', key: hint.key, params: hint.params });
    if (route === 'today' && s.ruleHidden >= 10) candidates.push({ id: 'tip:ruleHidden', kind: 'tip', mood: 'neutral', key: 'ruleHidden', params: { count: s.ruleHidden } });
    if (route === 'board' && s.waitingReplies > 0) candidates.push({ id: 'tip:followUp', kind: 'tip', mood: 'neutral', key: 'followUp', params: { count: s.waitingReplies } });
  }

  // 5. Daily "everything works" report.
  if (s.hasProfile && s.profileActive && s.staleSources.length === 0 && s.lastRunMinutes !== null) {
    candidates.push({ id: `health:ok:${dayKey(now)}`, kind: 'health', mood: 'happy', key: 'allGood', params: { found: s.newMatches24h, minutes: s.lastRunMinutes } });
  }

  const once = { 'health:ok': DAY, goal: DAY, hint: 6 * HOUR, tip: DAY, hot: 2 * HOUR, health: 3 * HOUR } as const;
  const every = (m: GenieMessage) =>
    m.id.startsWith('health:ok') ? once['health:ok'] : m.id.startsWith('hint') ? once.hint : m.id.startsWith('hot') ? once.hot : once[m.kind as 'goal' | 'tip' | 'health'] ?? DAY;
  const fresh = candidates.find((m) => daily(m.id, mem, now, every(m)));
  if (fresh) return fresh;

  // 6. Motivation, when nothing else is worth saying.
  if (!quiet && now - mem.lastMotivationAt >= MOTIVATION_EVERY) {
    const i = Math.floor(now / MOTIVATION_EVERY) % MOTIVATION_COUNT;
    return { id: `motivation:${i}`, kind: 'motivation', mood: 'happy', key: `motto${i}` };
  }
  return null;
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Days met / idle counted from a list of local dates (YYYY-MM-DD) of applications, yesterday backwards. */
export function streaks(appliedDates: readonly string[], today: string, goal: number): { streak: number; idleDays: number } {
  // Someone who has not applied yet is new, not idle.
  if (appliedDates.length === 0) return { streak: 0, idleDays: 0 };
  const perDay = new Map<string, number>();
  for (const d of appliedDates) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  const back = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  let streak = 0;
  while ((perDay.get(back(streak + 1)) ?? 0) >= goal) streak++;
  let idleDays = 0;
  while (idleDays < 14 && (perDay.get(back(idleDays + 1)) ?? 0) === 0) idleDays++;
  return { streak, idleDays };
}
