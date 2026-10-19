import { describe, expect, it } from 'vitest';
import { hideSuggestions } from './hide-suggestions';

const react = { skills: ['React', 'TypeScript', 'Node.js'], excludeKeywords: [], hideOtherStacks: false };
const times = (n: number, title: string) => Array.from({ length: n }, () => title);

describe('hideSuggestions', () => {
  it('names what the user keeps hiding, most frequent first', () => {
    const titles = [...times(5, 'Middle Frontend Developer (Angular)'), ...times(4, 'Full Stack .NET + React'), ...times(4, 'Shopify Developer'), 'Java Engineer'];
    expect(hideSuggestions(titles, react)).toEqual([
      { term: 'Angular', count: 5, kind: 'stack' },
      { term: '.NET', count: 4, kind: 'stack' },
      { term: 'Shopify', count: 4, kind: 'keyword' },
    ]);
  });
  it('leaves out stacks once "hide another stack" is on, words already excluded, and own stacks', () => {
    const titles = [...times(5, 'Angular Developer'), ...times(5, 'Shopify Developer'), ...times(5, 'Python Developer')];
    expect(hideSuggestions(titles, { ...react, hideOtherStacks: true })).toEqual([{ term: 'Shopify', count: 5, kind: 'keyword' }]);
    expect(hideSuggestions(titles, { ...react, excludeKeywords: ['shopify'] }).map((s) => s.term)).toEqual(['Angular', 'Python']);
    expect(hideSuggestions(titles, { ...react, skills: [...react.skills, 'Django'] }).map((s) => s.term)).toEqual(['Angular', 'Shopify']);
  });
  it('says nothing below the threshold', () => {
    expect(hideSuggestions(times(3, 'Angular Developer'), react)).toEqual([]);
  });
});
