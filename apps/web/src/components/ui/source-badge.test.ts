import { describe, expect, it } from 'vitest';
import { siteName } from './source-badge';

describe('siteName', () => {
  it('names the site a card was saved from', () => {
    expect(siteName('https://www.linkedin.com/feed/update/urn:li:activity:1')).toBe('LinkedIn');
    expect(siteName('https://ua.linkedin.com/jobs/view/2')).toBe('LinkedIn');
    expect(siteName('https://www.work.ua/jobs/123/')).toBe('Work.ua');
    expect(siteName('https://careers.acme.io/frontend')).toBe('careers.acme.io');
    expect(siteName(null)).toBeNull();
    expect(siteName('not a url')).toBeNull();
  });
});
