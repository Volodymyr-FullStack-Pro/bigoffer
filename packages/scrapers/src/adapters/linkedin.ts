import type { RawJob } from '@jp/core';
import { load } from 'cheerio';
import type { SourceAdapter } from '../types';

export function linkedinUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({ keywords: params.keywords ?? '', location: params.location ?? 'Worldwide' });
  if (params.remote === '1') qs.set('f_WT', '2');
  qs.set('start', '0');
  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${qs}`;
}

export const linkedinAdapter: SourceAdapter = {
  id: 'linkedin',
  async search(params, ctx) {
    const $ = load(await ctx.fetchText(linkedinUrl(params)));
    const jobs: RawJob[] = [];
    $('div.base-search-card').each((_, el) => {
      const card = $(el);
      const id = card.attr('data-entity-urn')?.match(/jobPosting:(\d+)/)?.[1];
      const href = card.find('a.base-card__full-link').attr('href');
      const title = card.find('.base-search-card__title').text().trim();
      const company = card.find('.base-search-card__subtitle').text().trim();
      if (!id || !href || !title) return;
      jobs.push({
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
    return jobs;
  },
};
