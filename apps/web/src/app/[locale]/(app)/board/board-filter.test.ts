import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, isFiltering, matchesFilter } from './board-filter';
import type { BoardCard } from './board-types';

const card = (over: Partial<BoardCard> = {}): BoardCard => ({
  id: '1', jobId: null, columnId: 'c', rank: 'a', title: 'Frontend Developer (React)', company: 'Solidgate', url: null, sourceId: null,
  salary: null, notes: 'Рекрутерка Анна', contactName: 'Anna K', contactUrl: null, meetingUrl: null, appliedAt: null, nextActionAt: null, firstResponseAt: null,
  lastActivityAt: null, followUpCount: 0, outcome: 'open', labelIds: ['l1'], replyKind: null, lastMessage: null, messageCount: 0, rejectionReasons: [], rejectionStage: null, ...over,
});

describe('matchesFilter', () => {
  it('finds a card by any word of the company, title, contact or notes, ignoring case', () => {
    expect(matchesFilter(card(), { ...EMPTY_FILTER, query: 'solid' })).toBe(true);
    expect(matchesFilter(card(), { ...EMPTY_FILTER, query: 'SOLIDGATE react' })).toBe(true);
    expect(matchesFilter(card(), { ...EMPTY_FILTER, query: 'анна' })).toBe(true);
    expect(matchesFilter(card(), { ...EMPTY_FILTER, query: 'codebridge' })).toBe(false);
  });

  it('filters by label and by reply kind, including cards with no reply yet', () => {
    expect(matchesFilter(card(), { ...EMPTY_FILTER, labelIds: ['l2', 'l1'] })).toBe(true);
    expect(matchesFilter(card(), { ...EMPTY_FILTER, labelIds: ['l2'] })).toBe(false);
    expect(matchesFilter(card({ replyKind: 'auto_reply' }), { ...EMPTY_FILTER, reply: 'auto_reply' })).toBe(true);
    expect(matchesFilter(card({ replyKind: 'auto_reply' }), { ...EMPTY_FILTER, reply: 'none' })).toBe(false);
    expect(matchesFilter(card(), { ...EMPTY_FILTER, reply: 'none' })).toBe(true);
  });

  it('knows when nothing is filtered', () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, query: '  ' })).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, reply: 'none' })).toBe(true);
  });
});
