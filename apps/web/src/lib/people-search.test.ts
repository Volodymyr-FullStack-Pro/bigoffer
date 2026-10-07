import { describe, expect, it } from 'vitest';
import { hasRealCompany, peopleSearchLinks } from './people-search';

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

describe('hasRealCompany', () => {
  it('rejects empty and source-name placeholder companies', () => {
    expect(hasRealCompany('')).toBe(false);
    expect(hasRealCompany('  ')).toBe(false);
    expect(hasRealCompany(null)).toBe(false);
    expect(hasRealCompany('Djinni')).toBe(false);
    expect(hasRealCompany('LinkedIn')).toBe(false);
    expect(hasRealCompany('Acme')).toBe(true);
  });
});
