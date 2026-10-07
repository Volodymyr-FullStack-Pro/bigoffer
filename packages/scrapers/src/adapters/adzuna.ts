import { ADZUNA_COUNTRIES, type RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type AdzunaJob = {
  id: string; title: string; description?: string; redirect_url: string; created?: string;
  company?: { display_name?: string }; location?: { display_name?: string };
  salary_min?: number; salary_max?: number; salary_is_predicted?: string;
};
const CURRENCY: Record<(typeof ADZUNA_COUNTRIES)[number], string> = { pl: 'PLN', de: 'EUR', gb: 'GBP', nl: 'EUR' };
const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');

export const adzunaAdapter: SourceAdapter = {
  id: 'adzuna',
  isConfigured: (env) => Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
  async search(params, ctx) {
    const country = ADZUNA_COUNTRIES.find((c) => c === params.country);
    if (!country || !params.what) return [];
    const q = new URLSearchParams({
      app_id: ctx.env.ADZUNA_APP_ID ?? '', app_key: ctx.env.ADZUNA_APP_KEY ?? '', what: params.what,
      results_per_page: '50', max_days_old: '7', sort_by: 'date', 'content-type': 'application/json',
    });
    const data = await ctx.fetchJson<{ results?: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${q}`);
    return (data.results ?? []).map((j): RawJob => {
      const real = j.salary_is_predicted !== '1' && j.salary_min != null;
      return {
        externalId: j.id,
        url: j.redirect_url,
        title: stripTags(j.title).trim(),
        company: j.company?.display_name || 'Adzuna',
        companyIsPlaceholder: !j.company?.display_name,
        description: stripTags(j.description ?? ''),
        location: j.location?.display_name ?? null,
        postedAt: j.created ?? null,
        salaryRaw: real ? `${j.salary_min}–${j.salary_max ?? j.salary_min} ${CURRENCY[country]} / year` : null,
        remoteHint: /remote|zdaln|homeoffice|home office/i.test(`${j.title} ${j.description ?? ''}`) ? 'remote' : undefined,
      };
    });
  },
};
