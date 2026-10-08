import { type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type RemotiveResponse = {
  jobs: {
    id: number;
    url: string;
    title: string;
    company_name: string;
    tags?: string[];
    job_type?: string;
    publication_date?: string;
    candidate_required_location?: string;
    salary?: string;
    description?: string;
  }[];
};

export const remotiveAdapter: SourceAdapter = {
  id: 'remotive',
  async search(params, ctx) {
    const qs = new URLSearchParams({ search: params.search ?? '', limit: '50' });
    const data = await ctx.fetchJson<RemotiveResponse>(`https://remotive.com/api/remote-jobs?${qs}`);
    return (data.jobs ?? []).map(
      (j): RawJob => ({
        externalId: String(j.id),
        url: j.url,
        title: j.title,
        company: j.company_name,
        description: j.description ?? '',
        location: j.candidate_required_location || null,
        salaryRaw: j.salary || null,
        postedAt: j.publication_date ?? null,
        remoteHint: 'remote',
        remoteRegions: regionsFromLocation(j.candidate_required_location ?? ''),
        tags: [...(j.tags ?? []), ...(j.job_type ? [j.job_type] : [])],
      }),
    );
  },
};
