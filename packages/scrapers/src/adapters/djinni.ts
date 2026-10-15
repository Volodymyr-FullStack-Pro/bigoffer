import { ENGLISH_TAG, englishLevelOf, kyivLocalDate, type RawJob, type RemoteType, YEARS_TAG } from '@jp/core';
import { extractJobPostings, type JobPostingLd, ldLocation, ldSalary } from '../jsonld';
import { parseRss } from '../rss';
import { isGoneError, type SourceAdapter } from '../types';

const BASE = 'https://djinni.co/jobs/';
const MAX_PAGES = 2;
/** RSS lists the newest 100 per keyword; postings newer than this that the pages missed are read one by one. */
const RSS_BACKFILL_MS = 4 * 24 * 3600 * 1000;
const MAX_BACKFILL = 20;
const DETAIL_CONCURRENCY = 3;

/** A posting's JSON-LD as a raw job; `pageUrl` stands in when the posting's own page omits its url. */
export function toRawJob(p: JobPostingLd, pageUrl?: string): RawJob | null {
  const id = typeof p.identifier === 'object' ? p.identifier?.value : p.identifier;
  const url = p.url ?? pageUrl;
  if (!url || !p.title || id == null) return null;
  const company = p.hiringOrganization?.name?.trim();
  // The board's own "only from N years of experience" (monthsOfExperience) beats guessing from the text.
  const months = typeof p.experienceRequirements === 'object' ? Number(p.experienceRequirements?.monthsOfExperience) : NaN;
  const years = Number.isFinite(months) && months >= 12 ? Math.round(months / 12) : null;
  return {
    ...(years ? { tags: [`${YEARS_TAG}${years}`] } : {}),
    externalId: String(id),
    url,
    title: p.title,
    company: company || 'Djinni',
    companyIsPlaceholder: !company,
    description: p.description ?? '',
    location: ldLocation(p),
    ...(ldSalary(p) ?? {}),
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
          const job = extractJobPostings(await ctx.fetchText(item.link)).map((p) => toRawJob(p, item.link)).find((j) => j !== null);
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

/**
 * English levels a listing page shows per job ("Англійська - C1"); the job page itself shows the level only to
 * signed-in users. Keyed by job id.
 */
export function englishByJob(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of html.split('id="job-item-').slice(1)) {
    const id = /^(\d+)/.exec(part)?.[1];
    const label = /(?:Англійська|Английский|English)\s*[-–:]\s*([^<·]{1,40})</.exec(part.slice(0, 20_000))?.[1];
    const level = label ? englishLevelOf(label) : null;
    if (id && level) out.set(id, level);
  }
  return out;
}

const FORMAT_LABELS: [RegExp, RemoteType][] = [
  [/Тільки віддалено|Только удал[её]нно|Full Remote|Remote only/i, 'remote'],
  [/Тільки офіс|Только офис|Office Work|Office only/i, 'office'],
  [/Гібридний формат|Гибридный формат|Hybrid Remote|Hybrid/i, 'hybrid'],
];

/**
 * The work format a listing card states per job: "Тільки віддалено", "Тільки офіс" or "Гібридний формат роботи".
 * A card without a label offers several formats (the job page lists "Офіс, Віддалена робота, Гібридний формат"),
 * remote among them, so it counts as remote. Keyed by job id.
 */
export function formatByJob(html: string): Map<string, RemoteType> {
  const out = new Map<string, RemoteType>();
  for (const part of html.split('id="job-item-').slice(1)) {
    const id = /^(\d+)/.exec(part)?.[1];
    if (!id) continue;
    // The label sits in the card's meta line (location, experience, English), before the description excerpt;
    // a card without that line says nothing about the format.
    const start = part.indexOf('fw-medium d-flex');
    if (start === -1 || start > 20_000) continue;
    const end = part.indexOf('js-truncated-text', start);
    const meta = part.slice(start, end === -1 ? start + 3_000 : Math.min(end, start + 3_000)).replace(/<[^>]+>/g, ' ');
    const found = FORMAT_LABELS.find(([re]) => re.test(meta));
    out.set(id, found ? found[1] : 'remote');
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
      const html = await ctx.fetchText(`${BASE}${qs.size ? `?${qs}` : ''}`);
      const postings = extractJobPostings(html);
      if (postings.length === 0) break;
      const english = englishByJob(html);
      const formats = formatByJob(html);
      for (const p of postings) {
        const job = toRawJob(p);
        if (!job) continue;
        const level = english.get(job.externalId);
        const format = formats.get(job.externalId);
        out.push({
          ...job,
          ...(level ? { tags: [...(job.tags ?? []), `${ENGLISH_TAG}${level}`] } : {}),
          // The card's own label beats the JSON-LD (which marks only fully remote jobs) and any guess from the text.
          ...(format ? { remoteHint: format } : {}),
        });
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
