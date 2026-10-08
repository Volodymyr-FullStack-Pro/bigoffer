import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type RemoteOkJob = {
  id?: string | number;
  position?: string;
  company?: string;
  description?: string;
  location?: string;
  url?: string;
  date?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
};

export const remoteokAdapter: SourceAdapter = {
  id: 'remoteok',
  async search(params, ctx) {
    const url = params.tag ? `https://remoteok.com/api?tag=${encodeURIComponent(params.tag)}` : 'https://remoteok.com/api';
    const data = await ctx.fetchJson<RemoteOkJob[]>(url);
    if (!Array.isArray(data)) return [];
    return data.flatMap((j): RawJob[] => {
      if (j.id == null || !j.position || !j.company) return [];
      const hasSalary = (j.salary_min ?? 0) > 0;
      return [
        {
          externalId: String(j.id),
          url: j.url ?? `https://remoteok.com/remote-jobs/${j.id}`,
          title: j.position,
          company: j.company,
          description: j.description ?? '',
          location: j.location || null,
          salaryRaw: hasSalary ? `$${j.salary_min} - $${j.salary_max || j.salary_min}` : null,
          salaryPeriod: hasSalary ? 'year' : undefined,
          postedAt: j.date ?? null,
          remoteHint: 'remote',
          tags: j.tags ?? [],
        },
      ];
    });
  },
};
