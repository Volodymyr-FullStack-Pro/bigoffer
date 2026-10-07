import { isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type GhJob = { id: number; title: string; absolute_url: string; location?: { name?: string }; updated_at?: string; first_published?: string; content?: string; company_name?: string };

const decodeHtml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export const greenhouseAdapter: SourceAdapter = {
  id: 'greenhouse',
  async search(params, ctx) {
    if (!params.board) return [];
    const data = await ctx.fetchJson<{ jobs?: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(params.board)}/jobs?content=true`);
    return (data.jobs ?? []).filter((j) => isTechTitle(j.title)).map((j): RawJob => {
      const location = j.location?.name ?? null;
      return {
        externalId: String(j.id),
        url: j.absolute_url,
        title: j.title,
        company: j.company_name ?? params.board!,
        description: decodeHtml(j.content ?? ''),
        location,
        postedAt: j.first_published ?? j.updated_at ?? null,
        remoteHint: /remote/i.test(location ?? '') ? 'remote' : undefined,
        remoteRegions: location ? regionsFromLocation(location.replace(/^remote[,\s-]*/i, '')) : undefined,
      };
    });
  },
};
