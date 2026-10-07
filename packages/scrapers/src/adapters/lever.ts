import { isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type LeverJob = { id: string; text: string; hostedUrl: string; createdAt?: number; descriptionPlain?: string; additionalPlain?: string; workplaceType?: string; categories?: { location?: string; allLocations?: string[] }; country?: string };

export const leverAdapter: SourceAdapter = {
  id: 'lever',
  async search(params, ctx) {
    if (!params.board) return [];
    const list = await ctx.fetchJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(params.board)}?mode=json`);
    if (!Array.isArray(list)) throw new Error('Unexpected Lever response (not a list): board missing or API error');
    return list.filter((j) => isTechTitle(j.text)).map((j): RawJob => {
      const locations = j.categories?.allLocations?.length ? j.categories.allLocations : j.categories?.location ? [j.categories.location] : [];
      const remote = j.workplaceType === 'remote';
      return {
        externalId: j.id,
        url: j.hostedUrl,
        title: j.text,
        company: params.name ?? params.board!,
        description: [j.descriptionPlain, j.additionalPlain].filter(Boolean).join('\n\n'),
        location: locations.join(', ') || null,
        postedAt: j.createdAt ?? null,
        remoteHint: remote ? 'remote' : j.workplaceType === 'hybrid' ? 'hybrid' : j.workplaceType === 'onsite' ? 'office' : undefined,
        remoteRegions: remote && locations.length ? regionsFromLocation(locations.map((l) => l.replace(/^remote[,\s-]*/i, ''))) : undefined,
      };
    });
  },
};
