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
const UNIT: Record<string, 'month' | 'year'> = { Month: 'month', Year: 'year' };

export const justjoinAdapter: SourceAdapter = {
  id: 'justjoin',
  async search(_params, ctx) {
    const data = await ctx.fetchJson<JustJoinResponse>('https://justjoin.it/api/candidate-api/offers?from=0&itemsCount=100');
    return (data.data ?? []).map((j): RawJob => {
      const usd = j.employmentTypes?.find((e) => e.currency === 'USD' && e.from && e.unit && UNIT[e.unit]);
      const skills = (j.requiredSkills ?? []).map((s) => s.name);
      return {
        externalId: j.guid,
        url: `https://justjoin.it/job-offer/${j.slug}`,
        title: j.title,
        company: j.companyName,
        description: skills.length ? `Skills: ${skills.join(', ')}` : '',
        location: j.city || null,
        salaryRaw: usd ? `${Math.round(usd.from!)} - ${Math.round(usd.to ?? usd.from!)} USD` : null,
        salaryPeriod: usd ? UNIT[usd.unit!] : undefined,
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
