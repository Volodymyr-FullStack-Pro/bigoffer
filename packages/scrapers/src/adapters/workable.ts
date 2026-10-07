import { isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type WkJob = { title: string; shortcode: string; url?: string; application_url?: string; telecommuting?: boolean; city?: string; country?: string; published_on?: string; created_at?: string; description?: string };

export const workableAdapter: SourceAdapter = {
  id: 'workable',
  async search(params, ctx) {
    if (!params.board) return [];
    const data = await ctx.fetchJson<{ name?: string; jobs?: WkJob[] }>(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(params.board)}`);
    return (data.jobs ?? []).filter((j) => isTechTitle(j.title)).map((j): RawJob => {
      const location = [j.city, j.country].filter(Boolean).join(', ') || null;
      return {
        externalId: j.shortcode,
        url: j.url ?? `https://apply.workable.com/${params.board}/j/${j.shortcode}/`,
        title: j.title,
        company: data.name || params.board!,
        description: j.description ?? '',
        location,
        postedAt: j.published_on ?? j.created_at ?? null,
        remoteHint: j.telecommuting ? 'remote' : undefined,
        remoteRegions: j.telecommuting && j.country ? regionsFromLocation(j.country) : undefined,
      };
    });
  },
};
