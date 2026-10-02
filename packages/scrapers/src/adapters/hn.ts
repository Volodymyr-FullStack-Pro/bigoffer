import { htmlToText, type RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type HnSearch = { hits: { objectID: string; title: string }[] };
type HnItem = { children: { id: number; text: string | null; created_at: string }[] };

const ROLE = /engineer|developer|designer|manager|scientist|analyst|lead|devops|sre|architect|marketer|sales|recruiter|product|qa|tester/i;
const PLACE = /remote|onsite|on-site|hybrid/i;

export function parseHnFirstLine(line: string): { company: string; title: string; location: string | null } {
  const parts = line.split(/\s+[|—–]\s+|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const company = parts[0] ?? 'Hacker News';
  const rest = parts.slice(1);
  const title = rest.find((p) => ROLE.test(p)) ?? rest[0] ?? 'Multiple roles';
  const location = rest.find((p) => p !== title && PLACE.test(p)) ?? null;
  return { company, title, location };
}

export const hnAdapter: SourceAdapter = {
  id: 'hn',
  async search(_params, ctx) {
    const search = await ctx.fetchJson<HnSearch>(
      'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5',
    );
    const thread = search.hits.find((h) => h.title.startsWith('Ask HN: Who is hiring?'));
    if (!thread) return [];
    const item = await ctx.fetchJson<HnItem>(`https://hn.algolia.com/api/v1/items/${thread.objectID}`);
    return item.children.slice(0, 300).flatMap((c): RawJob[] => {
      if (!c.text) return [];
      const text = htmlToText(c.text);
      const { company, title, location } = parseHnFirstLine(text.split('\n')[0] ?? '');
      return [
        {
          externalId: String(c.id),
          url: `https://news.ycombinator.com/item?id=${c.id}`,
          title,
          company,
          description: text,
          location,
          postedAt: c.created_at,
        },
      ];
    });
  },
};
