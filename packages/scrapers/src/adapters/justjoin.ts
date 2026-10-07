import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type JustJoinResponse = {
  data?: {
    guid: string;
    slug: string;
    title: string;
    companyName: string;
    city?: string;
    workplaceType?: string;
    experienceLevel?: string;
    publishedAt?: string;
    isOpenToHireUkrainians?: boolean;
    employmentTypes?: { from: number | null; to: number | null; currency: string; unit?: string }[];
    requiredSkills?: { name: string }[];
  }[];
};

const REMOTE: Record<string, 'remote' | 'hybrid' | 'office'> = { remote: 'remote', hybrid: 'hybrid', office: 'office' };

export const justjoinAdapter: SourceAdapter = {
  id: 'justjoin',
  async search(_params, ctx) {
    const data = await ctx.fetchJson<JustJoinResponse>('https://justjoin.it/api/candidate-api/offers?from=0&itemsCount=100');
    return (data.data ?? []).map((j): RawJob => {
      // `from`/`to` are JJIT's monthly equivalents for every unit (Month/Year/Day/Hour); the per-unit figures are
      // in `fromPerUnit`/`toPerUnit`. So a "Year" offer's from/to (e.g. 5752–9795 USD) are already monthly.
      const usd = j.employmentTypes?.find((e) => e.currency === 'USD' && e.from);
      const skills = (j.requiredSkills ?? []).map((s) => s.name);
      return {
        externalId: j.guid,
        url: `https://justjoin.it/job-offer/${j.slug}`,
        title: j.title,
        company: j.companyName,
        description: skills.length ? `Skills: ${skills.join(', ')}` : '',
        location: j.city || null,
        salaryRaw: usd ? `${Math.round(usd.from!)} - ${Math.round(usd.to ?? usd.from!)} USD` : null,
        salaryPeriod: usd ? 'month' : undefined,
        postedAt: j.publishedAt ?? null,
        remoteHint: j.workplaceType ? REMOTE[j.workplaceType] : undefined,
        tags: [
          ...skills,
          ...(j.experienceLevel ? [j.experienceLevel] : []),
          ...(j.isOpenToHireUkrainians ? ['open-to-ukrainians'] : []),
        ],
      };
    });
  },
};
