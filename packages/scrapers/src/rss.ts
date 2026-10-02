import { XMLParser } from 'fast-xml-parser';

export type RssItem = {
  title: string;
  link: string;
  guid: string;
  description: string;
  pubDate: string | null;
  category: string | null;
  region: string | null;
  type: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

function text(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object' && '#text' in value) return String((value as { '#text': unknown })['#text']);
  return String(value);
}

export function parseRss(xml: string): RssItem[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const raw = doc.rss?.channel?.item;
  const items = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  return items.map((entry) => {
    const i = entry as Record<string, unknown>;
    return {
      title: text(i.title),
      link: text(i.link),
      guid: text(i.guid) || text(i.link),
      description: text(i.description),
      pubDate: text(i.pubDate) || null,
      category: text(i.category) || null,
      region: text(i.region) || null,
      type: text(i.type) || null,
    };
  });
}
