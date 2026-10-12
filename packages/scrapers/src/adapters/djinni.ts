import { kyivLocalDate, type RawJob } from '@jp/core';
import { extractJobPostings, type JobPostingLd, ldLocation } from '../jsonld';
import { parseRss } from '../rss';
import { isGoneError, type SourceAdapter } from '../types';

const BASE = 'https://djinni.co/jobs/';
const MAX_PAGES = 2;
/** RSS lists the newest 100 per keyword; postings newer than this that the pages missed are read one by one. */
const RSS_BACKFILL_MS = 4 * 24 * 3600 * 1000;
const MAX_BACKFILL = 20;
const DETAIL_CONCURRENCY = 3;

function toRawJob(p: JobPostingLd): RawJob | null {
  const id = typeof p.identifier === 'object' ? p.identifier?.value : p.identifier;
  if (!p.url || !p.title || id == null) return null;
  const company = p.hiringOrganization?.name?.trim();
  return {
    externalId: String(id),
    url: p.url,
    title: p.title,
    company: company || 'Djinni',
    companyIsPlaceholder: !company,
    description: p.description ?? '',
    location: ldLocation(p),
    postedAt: p.datePosted ? kyivLocalDate(p.datePosted) : null,
    remoteHint: p.jobLocationType === 'TELECOMMUTE' ? 'remote' : undefined,
  };
}

const CLOSED = /вакансі[яи] зараз неактивна|вакансия сейчас неактивна|job is (?:currently )?(?:inactive|not active)/i;

const idOf = (url: string) => url.match(/\/jobs\/(\d+)-/)?.[1] ?? null;

/**
 * Listing pages carry the company (JSON-LD) but only the latest ~30; the RSS feed lists 100 but without a company.
 * Postings from the last days that only the feed has are read from their own page (JSON-LD), or kept from the feed
 * with a placeholder company when that page fails.
 */
async function rssBackfill(
  keyword: string | undefined,
  known: Set<string>,
  ctx: Parameters<SourceAdapter['search']>[1],
  now: number,
): Promise<RawJob[]> {
  const qs = keyword ? `?${new URLSearchParams({ primary_keyword: keyword })}` : '';
  let items: ReturnType<typeof parseRss>;
  try {
    items = parseRss(await ctx.fetchText(`${BASE}rss/${qs}`));
  } catch {
    return []; // the feed is extra coverage; the pages already succeeded
  }
  const missing = items
    .filter((i) => {
      const id = idOf(i.link);
      const at = i.pubDate ? Date.parse(i.pubDate) : NaN;
      return id !== null && !known.has(id) && Number.isFinite(at) && now - at <= RSS_BACKFILL_MS;
    })
    .slice(0, MAX_BACKFILL);
  const out: RawJob[] = [];
  for (let i = 0; i < missing.length; i += DETAIL_CONCURRENCY) {
    const batch = await Promise.all(
      missing.slice(i, i + DETAIL_CONCURRENCY).map(async (item): Promise<RawJob | null> => {
        try {
          const job = extractJobPostings(await ctx.fetchText(item.link)).map(toRawJob).find((j) => j !== null);
          if (job) return job;
        } catch {
          // fall back to the feed entry
        }
        const id = idOf(item.link)!;
        return {
          externalId: id,
          url: item.link,
          title: item.title,
          company: 'Djinni',
          companyIsPlaceholder: true,
          description: item.description,
          location: null,
          postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        };
      }),
    );
    out.push(...batch.filter((j): j is RawJob => j !== null));
  }
  return out;
}

export const djinniAdapter: SourceAdapter = {
  id: 'djinni',
  async search(params, ctx) {
    const out: RawJob[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = new URLSearchParams();
      if (params.primary_keyword) qs.set('primary_keyword', params.primary_keyword);
      if (page > 1) qs.set('page', String(page));
      const postings = extractJobPostings(await ctx.fetchText(`${BASE}${qs.size ? `?${qs}` : ''}`));
      if (postings.length === 0) break;
      for (const p of postings) {
        const job = toRawJob(p);
        if (job) out.push(job);
      }
    }
    const known = new Set(out.map((j) => j.externalId));
    out.push(...(await rssBackfill(params.primary_keyword, known, ctx, Date.now())));
    return out;
  },
  async isOpen(url, ctx) {
    try {
      // A closed job keeps its page but shows "Ця вакансія зараз неактивна" (ru/en variants too).
      return !CLOSED.test(await ctx.fetchText(url));
    } catch (err) {
      return isGoneError(err) ? false : null;
    }
  },
};
