import { type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type JobicyResponse = {
  jobs?: {
    id: number;
    url: string;
    jobTitle: string;
    companyName: string;
    jobGeo?: string;
    jobLevel?: string;
    jobIndustry?: string[];
    jobType?: string[];
    jobDescription?: string;
    jobExcerpt?: string;
    pubDate?: string;
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    salaryPeriod?: string;
  }[];
};

const PERIOD: Record<string, 'month' | 'year'> = { yearly: 'year', annual: 'year', monthly: 'month' };

export const jobicyAdapter: SourceAdapter = {
  id: 'jobicy',
  async search(params, ctx) {
    const qs = new URLSearchParams({ count: '50' });
    if (params.tag) qs.set('tag', params.tag);
    const data = await ctx.fetchJson<JobicyResponse>(`https://jobicy.com/api/v2/remote-jobs?${qs}`);
    return (data.jobs ?? []).map((j): RawJob => {
      const period = j.salaryPeriod ? PERIOD[j.salaryPeriod] : undefined;
      const hasSalary = (j.salaryMin ?? 0) > 0 && period !== undefined;
      return {
        externalId: String(j.id),
        url: j.url,
        title: j.jobTitle,
        company: j.companyName,
        description: j.jobDescription ?? j.jobExcerpt ?? '',
        location: j.jobGeo?.replace(/\s+/g, ' ').trim() || null,
        salaryRaw: hasSalary ? `${j.salaryMin} - ${j.salaryMax ?? j.salaryMin} ${j.salaryCurrency ?? 'USD'}` : null,
        salaryPeriod: hasSalary ? period : undefined,
        postedAt: j.pubDate ?? null,
        remoteHint: 'remote',
        remoteRegions: regionsFromLocation(j.jobGeo ?? ''),
        tags: [...(j.jobIndustry ?? []), ...(j.jobType ?? []), ...(j.jobLevel ? [j.jobLevel] : [])],
      };
    });
  },
};
