import { kyivLocalDate, type RawJob } from '@jp/core';
import { isGoneError, type SourceAdapter } from '../types';

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

const DETAIL_CONCURRENCY = 4;

/**
 * The search API returns a ~400-character teaser; skills are rarely in it, so matches scored low. The vacancy API has
 * the full HTML description. A failed detail fetch keeps the teaser rather than failing the run.
 */
async function fullDescriptions(ids: number[], ctx: Parameters<SourceAdapter['search']>[1]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (let i = 0; i < ids.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(
      ids.slice(i, i + DETAIL_CONCURRENCY).map(async (id) => {
        try {
          const detail = await ctx.fetchJson<{ description?: string }>(`https://api.rabota.ua/vacancy?id=${id}`);
          if (detail.description?.trim()) out.set(id, detail.description);
        } catch {
          // keep the search teaser for this one
        }
      }),
    );
  }
  return out;
}

export const robotauaAdapter: SourceAdapter = {
  id: 'robotaua',
  async search(params, ctx) {
    const qs = new URLSearchParams({ keyWords: params.keyWords ?? '', count: '40', page: '0' });
    const data = await ctx.fetchJson<RabotaResponse>(`https://api.rabota.ua/vacancy/search?${qs}`);
    const docs = data.documents ?? [];
    const full = await fullDescriptions(docs.map((d) => d.id), ctx);
    return docs.map((d): RawJob => {
      const company = d.companyName?.trim();
      return {
        externalId: String(d.id),
        url: `https://robota.ua/company${d.notebookId}/vacancy${d.id}`,
        title: d.name,
        company: company || 'robota.ua',
        companyIsPlaceholder: !company,
        description: full.get(d.id) ?? d.shortDescription ?? '',
        location: d.cityName || null,
        salaryRaw: salaryRaw(d),
        salaryPeriod: 'month',
        postedAt: d.date ? kyivLocalDate(d.date) : null,
      };
    });
  },
  async isOpen(url, ctx) {
    const id = url.match(/vacancy(\d+)/)?.[1];
    if (!id) return null;
    try {
      const detail = await ctx.fetchJson<{ isActive?: boolean }>(`https://api.rabota.ua/vacancy?id=${id}`);
      return detail.isActive !== false;
    } catch (err) {
      return isGoneError(err) ? false : null;
    }
  },
};

