import type { RawJob } from '@jp/core';
import { parseRss } from '../rss';
import type { SourceAdapter } from '../types';

const FEED = 'https://weworkremotely.com/remote-jobs.rss';

export const wwrAdapter: SourceAdapter = {
  id: 'wwr',
  async search(_params, ctx) {
    return parseRss(await ctx.fetchText(FEED)).flatMap((item): RawJob[] => {
      const sep = item.title.indexOf(': ');
      if (sep < 0) return [];
      const slug = item.guid.split('/').filter(Boolean).pop();
      if (!slug) return [];
      return [
        {
          externalId: slug,
          url: item.link || item.guid,
          title: item.title.slice(sep + 2),
          company: item.title.slice(0, sep),
          description: item.description,
          location: item.region,
          postedAt: item.pubDate,
          remoteHint: 'remote',
          tags: [item.category, item.type].filter((t): t is string => Boolean(t)),
        },
      ];
    });
  },
};
