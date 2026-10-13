import type { RawJob } from '@jp/core';
import { parseRss } from '../rss';
import { isGoneError, type SourceAdapter } from '../types';

const FEED = 'https://jobs.dou.ua/vacancies/feeds/';

/** Legal-form tails that belong to the company name, not to the location list ("P-Product, Inc."). */
const COMPANY_TAIL = /^(inc|llc|ltd|limited|gmbh|corp|corporation|co|s\.?a|b\.?v|plc|ag|oy|ab|sp\. z o\.o|тов)\.?$/i;
/** The salary the feed title carries: "$400–800", "від $3500", "до 40000 грн". */
const SALARY_PART = /^(?:від|до|from|up to)?\s*[$€£₴]?\s*\d[\d\s]*(?:[–-]\s*\d[\d\s]*)?\s*(?:\$|€|£|грн|uah|usd|eur)?$/i;

/**
 * "<role> в <company>, <salary>, <city>, ..., віддалено". company is null when the title names none (the caller
 * substitutes a placeholder).
 */
export function splitDouTitle(full: string): { title: string; company: string | null; location: string | null; salary: string | null } {
  const clean = full.replace(/&nbsp;|\u00a0/g, ' ');
  const at = clean.lastIndexOf(' в ');
  if (at < 0) return { title: clean.trim(), company: null, location: null, salary: null };
  const title = clean.slice(0, at).trim();
  const parts = clean.slice(at + 3).split(', ').map((p) => p.trim()).filter(Boolean);
  let company = parts.shift() ?? '';
  while (parts.length > 0 && COMPANY_TAIL.test(parts[0]!)) company += `, ${parts.shift()}`;
  const salaryIndex = parts.findIndex((p) => /\d/.test(p) && SALARY_PART.test(p));
  const salary = salaryIndex < 0 ? null : parts.splice(salaryIndex, 1)[0]!;
  return {
    title,
    company: company.replace(/^["«“]+|["»”]+$/g, '').trim() || null,
    location: parts.join(', ') || null,
    salary,
  };
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
      const { title, company, location, salary } = splitDouTitle(item.title);
      return [
        {
          externalId: id,
          url: item.link.split('?')[0]!,
          title,
          company: company ?? 'DOU',
          companyIsPlaceholder: company === null,
          description: item.description,
          location,
          // DOU salaries are monthly.
          ...(salary ? { salaryRaw: salary, salaryPeriod: 'month' as const } : {}),
          postedAt: item.pubDate,
          remoteHint: location?.includes('віддалено') ? 'remote' : undefined,
        },
      ];
    });
  },
  async isOpen(url, ctx) {
    try {
      // DOU removes closed vacancies (404); a live page carries the apply button.
      await ctx.fetchText(url);
      return true;
    } catch (err) {
      return isGoneError(err) ? false : null;
    }
  },
};

