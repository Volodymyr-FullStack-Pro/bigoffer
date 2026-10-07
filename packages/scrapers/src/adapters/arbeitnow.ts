import { decodeEntities, type RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type ArbeitnowResponse = {
  data?: {
    slug: string;
    company_name: string;
    title: string;
    description?: string;
    remote?: boolean;
    url: string;
    tags?: string[];
    job_types?: string[];
    location?: string;
    created_at?: number;
  }[];
};

export const arbeitnowAdapter: SourceAdapter = {
  id: 'arbeitnow',
  async search(_params, ctx) {
    const data = await ctx.fetchJson<ArbeitnowResponse>('https://www.arbeitnow.com/api/job-board-api');
    return (data.data ?? []).map(
      (j): RawJob => ({
        externalId: j.slug,
        url: j.url,
        title: j.title,
        company: j.company_name,
        description: decodeEntities(j.description ?? ''),
        location: j.location || null,
        postedAt: j.created_at ?? null,
        remoteHint: j.remote ? 'remote' : undefined,
        tags: [...(j.tags ?? []), ...(j.job_types ?? [])],
      }),
    );
  },
};
