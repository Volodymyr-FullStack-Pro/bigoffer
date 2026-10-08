import type { RawJob } from '@jp/core';
import { load } from 'cheerio';
import type { SourceAdapter } from '../types';

const CARD = '[data-cy="l-card"]';
/** Job ads live under /obyavlenie/rabota/; OLX pads job searches with goods/services from other categories. */
const JOB_PATH = '/obyavlenie/rabota/';

export function olxUrl(params: Record<string, string>): string {
  const slug = (params.search ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  return `https://www.olx.ua/uk/rabota/q-${encodeURIComponent(slug)}/`;
}

export const olxAdapter: SourceAdapter = {
  id: 'olx',
  async search(params, ctx) {
    if (!ctx.renderPage) throw new Error('OLX requires a browser renderer');
    const $ = load(await ctx.renderPage(olxUrl(params), { waitForSelector: CARD }));
    // OLX inlines emotion <style> blocks inside cards; drop them so they don't leak into text.
    $('style, script').remove();
    const jobs: RawJob[] = [];
    $(CARD).each((_, el) => {
      const card = $(el);
      const id = card.attr('id');
      const link = card.find('[data-testid="card-title-link"]').first();
      const href = link.attr('href');
      const title = link.text().trim();
      if (!id || !href || !title) return;
      const path = href.split('?')[0]!;
      if (!new URL(path, 'https://www.olx.ua').pathname.includes(JOB_PATH)) return;
      const salary = card.find('p').filter((_, p) => /грн|\$|€/.test($(p).text())).first().text().trim();
      const text = card.text().replace(/\s+/g, ' ').trim();
      jobs.push({
        externalId: id,
        url: new URL(path, 'https://www.olx.ua').toString(),
        title,
        company: 'OLX',
        companyIsPlaceholder: true,
        description: text,
        location: null,
        salaryRaw: salary || null,
        salaryPeriod: /місяц|месяц/i.test(text) ? 'month' : undefined,
        remoteHint: /віддален|дистанційн|удален/i.test(text) ? 'remote' : undefined,
      });
    });
    return jobs;
  },
};
