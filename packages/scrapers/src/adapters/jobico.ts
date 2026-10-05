import type { RawJob } from '@jp/core';
import { XMLParser } from 'fast-xml-parser';
import type { SourceAdapter } from '../types';

/** Official aggregator feed (allowed in robots.txt); every posting must link back to its Jobico page. */
const FEED = 'https://www.jobico.io/api/feeds/jobs.xml';

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, processEntities: true });

type FeedJob = Partial<
  Record<'id' | 'link' | 'title' | 'company' | 'locationtype' | 'date' | 'description' | 'country' | 'city' | 'salary', string>
>;

const REMOTE = { remote: 'remote', hybrid: 'hybrid', office: 'office' } as const;

/** Drops tracking params the feed appends (utm_source=job-feed…). */
function cleanUrl(link: string): string {
  const url = new URL(link);
  for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
  return url.toString();
}

export const jobicoAdapter: SourceAdapter = {
  id: 'jobico',
  async search(_params, ctx) {
    const doc = parser.parse(await ctx.fetchText(FEED)) as { source?: { job?: FeedJob | FeedJob[] } };
    const raw = doc.source?.job;
    const jobs = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    return jobs.flatMap((j): RawJob[] => {
      if (!j.id || !j.link || !j.title || !j.company) return [];
      const location = [j.city, j.country].filter(Boolean).join(', ') || null;
      return [
        {
          externalId: j.id,
          url: cleanUrl(j.link),
          title: j.title,
          company: j.company,
          description: j.description ?? '',
          location,
          salaryRaw: j.salary || null,
          postedAt: j.date ?? null,
          remoteHint: REMOTE[j.locationtype as keyof typeof REMOTE] ?? 'unknown',
        },
      ];
    });
  },
};
