import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type HimalayasResponse = {
  jobs: {
    title: string;
    companyName: string;
    description?: string;
    excerpt?: string;
    minSalary?: number | null;
    maxSalary?: number | null;
    currency?: string | null;
    salaryPeriod?: string | null;
    seniority?: string[];
    locationRestrictions?: string[];
    pubDate?: number;
    applicationLink?: string;
    guid: string;
    categories?: string[];
  }[];
};

/** Only annual and monthly pay convert to a monthly salary; hourly/weekly/daily rates are dropped. */
function salaryPeriod(period: string | null | undefined): 'year' | 'month' | null {
  const p = (period ?? '').toLowerCase();
  if (p === 'annual' || p === 'year' || p === 'yearly' || p === 'annually') return 'year';
  if (p === 'monthly' || p === 'month') return 'month';
  return null;
}

export const himalayasAdapter: SourceAdapter = {
  id: 'himalayas',
  async search(params, ctx) {
    const qs = new URLSearchParams({ q: params.q ?? '', limit: '50' });
    const data = await ctx.fetchJson<HimalayasResponse>(`https://himalayas.app/jobs/api/search?${qs}`);
    return (data.jobs ?? []).map((j): RawJob => {
      const period = salaryPeriod(j.salaryPeriod);
      const hasSalary = (j.minSalary ?? 0) > 0 && period !== null;
      return {
        externalId: j.guid,
        url: j.guid,
        title: j.title,
        company: j.companyName,
        description: j.description ?? j.excerpt ?? '',
        location: j.locationRestrictions?.join(', ') || null,
        salaryRaw: hasSalary ? `${j.minSalary} - ${j.maxSalary ?? j.minSalary} ${j.currency ?? 'USD'}` : null,
        salaryPeriod: hasSalary ? period : undefined,
        postedAt: j.pubDate ?? null,
        remoteHint: 'remote',
        tags: [...(j.categories ?? []), ...(j.seniority ?? [])],
      };
    });
  },
};
