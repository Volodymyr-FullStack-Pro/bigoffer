import { describe, expect, it } from 'vitest';
import { canSearchPeople, peopleSearchLinks } from './people-search';

describe('peopleSearchLinks', () => {
  it('builds LinkedIn people searches for the company', () => {
    expect(peopleSearchLinks('Acme & Co')).toEqual({
      recruiters: 'https://www.linkedin.com/search/results/people/?keywords=Acme%20%26%20Co%20recruiter',
      engineers: 'https://www.linkedin.com/search/results/people/?keywords=Acme%20%26%20Co%20engineering%20manager',
    });
  });

  it('trims the company name', () => {
    expect(peopleSearchLinks('  Acme ').recruiters).toBe('https://www.linkedin.com/search/results/people/?keywords=Acme%20recruiter');
  });
});

describe('canSearchPeople', () => {
  it('needs a non-empty company that is not a placeholder', () => {
    expect(canSearchPeople('Acme', false)).toBe(true);
    expect(canSearchPeople('', false)).toBe(false);
    expect(canSearchPeople('  ', false)).toBe(false);
    expect(canSearchPeople(null, false)).toBe(false);
    expect(canSearchPeople('Djinni', true)).toBe(false);
    expect(canSearchPeople('Djinni', false)).toBe(true);
  });
});
