import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type WorkingNomadsJob = {
  url: string;
  title: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
};

export const workingnomadsAdapter: SourceAdapter = {
  id: 'workingnomads',
  async search(_params, ctx) {
    const data = await ctx.fetchJson<WorkingNomadsJob[]>('https://www.workingnomads.com/api/exposed_jobs/');
    if (!Array.isArray(data)) return [];
    return data.flatMap((j): RawJob[] => {
      const id = j.url.match(/\/(\d+)\/?$/)?.[1];
      if (!id) return [];
      const company = j.company_name?.trim();
      return [
        {
          externalId: id,
          url: j.url,
          title: j.title,
          company: company || 'Working Nomads',
          companyIsPlaceholder: !company,
          description: j.description ?? '',
          location: j.location || null,
          postedAt: j.pub_date ?? null,
          remoteHint: 'remote',
          tags: [...(j.category_name ? [j.category_name] : []), ...(j.tags ? j.tags.split(',').map((t) => t.trim()).filter(Boolean) : [])],
        },
      ];
    });
  },
};
