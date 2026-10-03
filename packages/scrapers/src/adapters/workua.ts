import { parseUkDate, type RawJob } from '@jp/core';
import { load } from 'cheerio';
import type { SourceAdapter } from '../types';

const CARD = 'div.card.job-link';

export function workuaUrl(params: Record<string, string>): string {
  const slug = encodeURIComponent((params.search ?? '').trim().toLowerCase()).replace(/%20/g, '+');
  return `https://www.work.ua/jobs-${params.remote === '1' ? 'remote-' : ''}${slug}/`;
}

export const workuaAdapter: SourceAdapter = {
  id: 'workua',
  async search(params, ctx) {
    if (!ctx.renderPage) throw new Error('Work.ua requires a browser renderer');
    const $ = load(await ctx.renderPage(workuaUrl(params), { waitForSelector: CARD }));
    const jobs: RawJob[] = [];
    $(CARD).each((_, el) => {
      const card = $(el);
      const link = card.find('h2 a').first();
      const href = link.attr('href');
      const id = href?.match(/\/jobs\/(\d+)\//)?.[1];
      const title = link.text().trim();
      if (!id || !title) return;
      const company = card.find('.glyphicon-company').parent().find('.strong-600').first().text().trim();
      const salary = card.find('.glyphicon-hryvnia-fill').parent().find('.strong-600').first().text().trim();
      const text = card.text().replace(/\s+/g, ' ').trim();
      jobs.push({
        externalId: id,
        url: `https://www.work.ua/jobs/${id}/`,
        title,
        company: company || 'Work.ua',
        companyIsPlaceholder: !company,
        description: text,
        location: null,
        salaryRaw: salary || null,
        salaryPeriod: salary ? 'month' : undefined,
        postedAt: parseUkDate(link.attr('title') ?? '')?.toISOString() ?? null,
        remoteHint: /дистанційно|віддалено/i.test(text) ? 'remote' : undefined,
      });
    });
    return jobs;
  },
};
