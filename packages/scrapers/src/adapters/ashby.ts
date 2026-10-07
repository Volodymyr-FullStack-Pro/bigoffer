import { isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type AshbyJob = { id: string; title: string; jobUrl: string; location?: string; secondaryLocations?: { location?: string }[]; isRemote?: boolean; workplaceType?: string; publishedAt?: string; descriptionPlain?: string };

export const ashbyAdapter: SourceAdapter = {
  id: 'ashby',
  async search(params, ctx) {
    if (!params.board) return [];
    const data = await ctx.fetchJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(params.board)}`);
    return (data.jobs ?? []).filter((j) => isTechTitle(j.title)).map((j): RawJob => {
      const locations = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter((l): l is string => Boolean(l));
      const remote = j.isRemote === true || /remote/i.test(j.workplaceType ?? '');
      return {
        externalId: j.id,
        url: j.jobUrl,
        title: j.title.trim(),
        company: params.board!,
        description: j.descriptionPlain ?? '',
        location: locations.join(', ') || null,
        postedAt: j.publishedAt ?? null,
        remoteHint: remote ? 'remote' : /hybrid/i.test(j.workplaceType ?? '') ? 'hybrid' : undefined,
        remoteRegions: remote && locations.length ? regionsFromLocation(locations.map((l) => l.replace(/^remote[,\s-]*/i, ''))) : undefined,
      };
    });
  },
};
