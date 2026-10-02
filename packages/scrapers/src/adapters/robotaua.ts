import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type RabotaResponse = {
  documents: {
    id: number;
    name: string;
    companyName?: string;
    cityName?: string;
    date?: string;
    salary?: number;
    salaryFrom?: number;
    salaryTo?: number;
    shortDescription?: string;
    notebookId: number;
  }[];
};

function salaryRaw(d: RabotaResponse['documents'][number]): string | null {
  if (d.salaryFrom && d.salaryTo) return `${d.salaryFrom} - ${d.salaryTo} грн`;
  if (d.salaryFrom) return `від ${d.salaryFrom} грн`;
  if (d.salary) return `${d.salary} грн`;
  return null;
}

export const robotauaAdapter: SourceAdapter = {
  id: 'robotaua',
  async search(params, ctx) {
    const qs = new URLSearchParams({ keyWords: params.keyWords ?? '', count: '40', page: '0' });
    const data = await ctx.fetchJson<RabotaResponse>(`https://api.rabota.ua/vacancy/search?${qs}`);
    return (data.documents ?? []).map(
      (d): RawJob => ({
        externalId: String(d.id),
        url: `https://robota.ua/company${d.notebookId}/vacancy${d.id}`,
        title: d.name,
        company: d.companyName?.trim() || 'robota.ua',
        description: d.shortDescription ?? '',
        location: d.cityName || null,
        salaryRaw: salaryRaw(d),
        salaryPeriod: 'month',
        postedAt: d.date ?? null,
      }),
    );
  },
};
