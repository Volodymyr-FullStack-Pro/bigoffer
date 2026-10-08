import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractJobPostings, ldLocation } from '../src/jsonld';
import { parseRss } from '../src/rss';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('parseRss', () => {
  it('parses DOU items with decoded HTML descriptions', () => {
    const items = parseRss(fixture('dou.xml'));
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.link).toMatch(/^https:\/\/jobs\.dou\.ua\//);
      expect(item.description).toMatch(/<\w+/);
      expect(item.pubDate).not.toBeNull();
    }
  });

  it('parses WWR extra fields', () => {
    const items = parseRss(fixture('wwr.xml'));
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.region !== null)).toBe(true);
  });

  it('handles a feed with a single item and no items', () => {
    const one = '<rss><channel><item><title>A</title><link>https://x.test/1</link></item></channel></rss>';
    expect(parseRss(one)).toHaveLength(1);
    expect(parseRss('<rss><channel></channel></rss>')).toEqual([]);
  });
});

describe('extractJobPostings', () => {
  it('reads Djinni JSON-LD job postings', () => {
    const postings = extractJobPostings(fixture('djinni.html'));
    expect(postings).toHaveLength(3);
    expect(postings[0]!.hiringOrganization?.name).toBeTruthy();
    expect(postings[0]!.url).toMatch(/^https:\/\/djinni\.co\/jobs\//);
  });

  it('ignores malformed blocks and non-job types', () => {
    const html =
      '<script type="application/ld+json">{bad json</script>' +
      '<script type="application/ld+json">{"@type":"Organization"}</script>';
    expect(extractJobPostings(html)).toEqual([]);
  });

  it('builds a location string', () => {
    expect(
      ldLocation({ applicantLocationRequirements: { address: { addressLocality: null, addressRegion: 'Europe' } } }),
    ).toBe('Europe');
    expect(ldLocation({})).toBeNull();
  });
});
