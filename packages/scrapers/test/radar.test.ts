import { describe, expect, it } from 'vitest';
import { radarFeedIds, radarFeedUrl } from '../src/radar';

const rss = (links: string[]) =>
  `<?xml version="1.0"?><rss><channel>${links.map((l) => `<item><title>Job</title><link>${l}</link></item>`).join('')}</channel></rss>`;

describe('radar', () => {
  it('builds the feed url the adapters read', () => {
    expect(radarFeedUrl('djinni', { primary_keyword: 'React.js' })).toBe('https://djinni.co/jobs/rss/?primary_keyword=React.js');
    expect(radarFeedUrl('dou', { category: 'Front End' })).toBe('https://jobs.dou.ua/vacancies/feeds/?category=Front%20End');
    expect(radarFeedUrl('dou', { search: 'full stack' })).toBe('https://jobs.dou.ua/vacancies/feeds/?search=full%20stack');
    expect(radarFeedUrl('robotaua', { keyWords: 'react' })).toBeNull();
  });
  it('reads posting ids the way they are stored', () => {
    expect(radarFeedIds('djinni', rss(['https://djinni.co/jobs/848367-junior-frontend-developer/', 'https://djinni.co/jobs/848367-junior-frontend-developer/?ref=rss']))).toEqual(['848367']);
    expect(radarFeedIds('dou', rss(['https://jobs.dou.ua/companies/tenthousand/vacancies/376277/?utm_source=jobsrss']))).toEqual(['376277']);
  });
  it('leaves out postings published before the cutoff', () => {
    const xml = `<rss><channel>
      <item><title>New</title><link>https://djinni.co/jobs/2-new/</link><pubDate>Wed, 21 Oct 2026 11:06:26 +0300</pubDate></item>
      <item><title>Old</title><link>https://djinni.co/jobs/1-old/</link><pubDate>Thu, 15 Oct 2026 13:07:28 +0300</pubDate></item>
      <item><title>Undated</title><link>https://djinni.co/jobs/3-undated/</link></item>
    </channel></rss>`;
    expect(radarFeedIds('djinni', xml, new Date('2026-10-19T00:00:00Z'))).toEqual(['2', '3']);
  });
});
