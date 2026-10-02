import type { RawJob } from '@jp/core';
import { parseRss } from '../rss';
import type { SourceAdapter } from '../types';

const FEED = 'https://jobs.dou.ua/vacancies/feeds/';

export function splitDouTitle(full: string): { title: string; company: string; location: string | null } {
  const at = full.lastIndexOf(' в ');
  if (at < 0) return { title: full.trim(), company: 'DOU', location: null };
  const title = full.slice(0, at).trim();
  const rest = full.slice(at + 3).trim();
  const comma = rest.indexOf(', ');
  const company = (comma < 0 ? rest : rest.slice(0, comma)).replace(/^["«“]+|["»”]+$/g, '').trim();
  const location = comma < 0 ? null : rest.slice(comma + 2).trim() || null;
  return { title, company, location };
}

export const douAdapter: SourceAdapter = {
  id: 'dou',
  async search(params, ctx) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category) qs.set('category', params.category);
    const url = `${FEED}${qs.size ? `?${qs.toString().replace(/\+/g, '%20')}` : ''}`;
    const items = parseRss(await ctx.fetchText(url));
    return items.flatMap((item): RawJob[] => {
      const id = item.link.match(/vacancies\/(\d+)/)?.[1];
      if (!id) return [];
      const { title, company, location } = splitDouTitle(item.title);
      return [
        {
          externalId: id,
          url: item.link.split('?')[0]!,
          title,
          company,
          description: item.description,
          location,
          postedAt: item.pubDate,
          remoteHint: location?.includes('віддалено') ? 'remote' : undefined,
        },
      ];
    });
  },
};
