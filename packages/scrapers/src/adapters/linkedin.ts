import type { RawJob } from '@jp/core';
import { load } from 'cheerio';
import { isGoneError, type SourceAdapter } from '../types';

const API = 'https://www.linkedin.com/jobs-guest/jobs/api';
/** The guest search returns 10 cards per page. */
const PAGE_SIZE = 10;
const MAX_PAGES = 2;
const DETAIL_CONCURRENCY = 3;
const CLOSED = /No longer accepting applications|Більше не приймає заявки|Больше не принимает заявки/i;

export function linkedinUrl(params: Record<string, string>, start = 0): string {
  const qs = new URLSearchParams({ keywords: params.keywords ?? '', location: params.location ?? 'Worldwide' });
  if (params.remote === '1') qs.set('f_WT', '2');
  // Newest first, posted within the last week: the feed wants fresh vacancies, not LinkedIn's "relevance".
  qs.set('f_TPR', 'r604800');
  qs.set('sortBy', 'DD');
  qs.set('start', String(start));
  return `${API}/seeMoreJobPostings/search?${qs}`;
}

export const linkedinPostingUrl = (id: string) => `${API}/jobPosting/${id}`;

function jobIdFromUrl(url: string): string | null {
  return url.match(/(\d{6,})\/?(?:\?|$)/)?.[1] ?? null;
}

/**
 * The search cards carry no description; the guest posting page has the full text plus "Seniority level" /
 * "Employment type" criteria, which are appended so matching and the letter see them. A failed detail fetch keeps
 * the card (empty description) rather than failing the run.
 */
async function details(ids: string[], ctx: Parameters<SourceAdapter['search']>[1]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(
      ids.slice(i, i + DETAIL_CONCURRENCY).map(async (id) => {
        try {
          const $ = load(await ctx.fetchText(linkedinPostingUrl(id)));
          const body = $('.show-more-less-html__markup').first().html()?.trim();
          if (!body) return;
          const criteria = $('.description__job-criteria-item')
            .map((_, el) => {
              const k = $(el).find('.description__job-criteria-subheader').text().trim();
              const v = $(el).find('.description__job-criteria-text').text().trim();
              return k && v ? `<li>${k}: ${v}</li>` : '';
            })
            .get()
            .join('');
          out.set(id, criteria ? `${body}<ul>${criteria}</ul>` : body);
        } catch {
          // keep the card without a description
        }
      }),
    );
  }
  return out;
}

export const linkedinAdapter: SourceAdapter = {
  id: 'linkedin',
  async search(params, ctx) {
    const jobs = new Map<string, RawJob>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const $ = load(await ctx.fetchText(linkedinUrl(params, page * PAGE_SIZE)));
      const cards = $('div.base-search-card');
      cards.each((_, el) => {
        const card = $(el);
        const id = card.attr('data-entity-urn')?.match(/jobPosting:(\d+)/)?.[1];
        const href = card.find('a.base-card__full-link').attr('href');
        const title = card.find('.base-search-card__title').text().trim();
        const company = card.find('.base-search-card__subtitle').text().trim();
        if (!id || !href || !title || jobs.has(id)) return;
        jobs.set(id, {
          externalId: id,
          url: href.split('?')[0]!,
          title,
          company: company || 'LinkedIn',
          companyIsPlaceholder: !company,
          description: '',
          location: card.find('.job-search-card__location').text().trim() || null,
          postedAt: card.find('time').attr('datetime') ?? null,
          remoteHint: params.remote === '1' ? 'remote' : undefined,
        });
      });
      if (cards.length < PAGE_SIZE) break;
    }
    const full = await details([...jobs.keys()], ctx);
    return [...jobs.values()].map((j) => ({ ...j, description: full.get(j.externalId) ?? '' }));
  },
  async isOpen(url, ctx) {
    const id = jobIdFromUrl(url);
    if (!id) return null;
    try {
      // A closed posting keeps its page but says "No longer accepting applications"; a removed one is a 404.
      return !CLOSED.test(await ctx.fetchText(linkedinPostingUrl(id)));
    } catch (err) {
      return isGoneError(err) ? false : null;
    }
  },
};
