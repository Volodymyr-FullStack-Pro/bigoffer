import { describe, expect, it } from 'vitest';
import { type GenieMemory, type GenieState, pickMessage, routeOf, streaks } from './brain';

const NOW = Date.parse('2026-10-12T10:00:00Z');
const fresh: GenieMemory = { shown: {}, lastMotivationAt: 0 };
const ok: GenieState = {
  mode: 'on', goal: 5, appliedToday: 1, streak: 0, idleDays: 0, hour: 12, hasProfile: true, profileActive: true,
  staleSources: [], lastRunMinutes: 12, newMatches24h: 14, hotMatches: 0, ruleHidden: 0, waitingReplies: 0, firstName: '',
};

describe('routeOf', () => {
  it('reads the section after the locale', () => {
    expect(routeOf('/uk/today')).toBe('today');
    expect(routeOf('/en/search')).toBe('search');
    expect(routeOf('/ru/analytics')).toBe('other');
  });
});

describe('pickMessage', () => {
  it('says nothing when off', () => {
    expect(pickMessage({ ...ok, mode: 'off', hasProfile: false }, 'today', fresh, NOW)).toBeNull();
  });
  it('puts setup problems first', () => {
    expect(pickMessage({ ...ok, hasProfile: false }, 'today', fresh, NOW)?.key).toBe('noProfile');
    expect(pickMessage({ ...ok, profileActive: false }, 'today', fresh, NOW)?.key).toBe('inactive');
    expect(pickMessage({ ...ok, staleSources: ['Djinni'] }, 'today', fresh, NOW)).toMatchObject({ key: 'stale', mood: 'worried', params: { sources: 'Djinni' } });
  });
  it('celebrates the goal, with the streak', () => {
    expect(pickMessage({ ...ok, appliedToday: 5, streak: 3 }, 'board', fresh, NOW)).toMatchObject({ key: 'goalDoneStreak', mood: 'excited', params: { streak: 4 } });
  });
  it('pushes after two idle days and in the evening', () => {
    expect(pickMessage({ ...ok, appliedToday: 0, idleDays: 2 }, 'search', fresh, NOW)).toMatchObject({ key: 'idle', mood: 'worried' });
    expect(pickMessage({ ...ok, hour: 19, hotMatches: 3 }, 'search', fresh, NOW)).toMatchObject({ key: 'evening', params: { left: 4, hot: 3 } });
  });
  it('reports fresh hot matches away from the feed', () => {
    expect(pickMessage({ ...ok, hotMatches: 2 }, 'board', fresh, NOW)?.key).toBe('hot');
    expect(pickMessage({ ...ok, hotMatches: 2 }, 'today', fresh, NOW)?.key).not.toBe('hot');
  });
  it('gives the daily all-good report once, then motivation', () => {
    const first = pickMessage(ok, 'other', fresh, NOW)!;
    expect(first).toMatchObject({ key: 'allGood', mood: 'happy', params: { found: 14, minutes: 12 } });
    const mem: GenieMemory = { shown: { [first.id]: NOW }, lastMotivationAt: 0 };
    expect(pickMessage(ok, 'other', mem, NOW + 60_000)?.kind).toBe('motivation');
    expect(pickMessage(ok, 'other', { ...mem, lastMotivationAt: NOW }, NOW + 60_000)).toBeNull();
  });
  it('keeps quiet mode to setup and goal messages', () => {
    const quiet = { ...ok, mode: 'quiet' as const, hotMatches: 4 };
    expect(pickMessage(quiet, 'board', fresh, NOW)?.kind).toBe('health');
    expect(pickMessage(quiet, 'board', { shown: { [`health:ok:2026-10-12`]: NOW }, lastMotivationAt: 0 }, NOW)).toBeNull();
  });
  it('relays the page hint', () => {
    expect(pickMessage(ok, 'search', fresh, NOW, { key: 'searchTips', params: { count: 2 } })).toMatchObject({ key: 'searchTips', params: { count: 2 } });
  });
});

describe('streaks', () => {
  it('counts goal days and idle days backwards from yesterday', () => {
    const d = (day: string, n: number) => Array<string>(n).fill(day);
    expect(streaks([...d('2026-10-11', 5), ...d('2026-10-10', 6), ...d('2026-10-09', 1)], '2026-10-12', 5)).toEqual({ streak: 2, idleDays: 0 });
    expect(streaks(d('2026-10-08', 3), '2026-10-12', 5)).toEqual({ streak: 0, idleDays: 3 });
    expect(streaks([], '2026-10-12', 5)).toEqual({ streak: 0, idleDays: 0 });
  });
});

describe('actions and greeting', () => {
  it('every tip leads where it can be done', () => {
    expect(pickMessage({ ...ok, hotMatches: 3 }, 'board', fresh, NOW)?.action?.href).toBe('/today?fresh=1');
    expect(pickMessage({ ...ok, ruleHidden: 20 }, 'today', { shown: { 'health:ok:2026-10-12': NOW }, lastMotivationAt: 0 }, NOW)?.action?.href).toBe('/today?view=hidden');
    expect(pickMessage({ ...ok, waitingReplies: 2 }, 'search', { shown: { 'health:ok:2026-10-12': NOW }, lastMotivationAt: 0 }, NOW)?.action?.href).toBe('/board#today-actions');
    expect(pickMessage({ ...ok, appliedToday: 5 }, 'search', fresh, NOW)?.action?.href).toBe('/analytics');
  });
  it('greets by name with the daily report', () => {
    expect(pickMessage({ ...ok, firstName: 'Volodymyr', hour: 9 }, 'other', fresh, NOW)).toMatchObject({ key: 'allGoodMorning', params: { name: 'Volodymyr' } });
  });
});
