import type { RawJob } from '@jp/core';
import { extractJobPostings, type JobPostingLd, ldLocation } from '../jsonld';
import type { SourceAdapter } from '../types';

const BASE = 'https://djinni.co/jobs/';
const MAX_PAGES = 2;

function toRawJob(p: JobPostingLd): RawJob | null {
  const id = typeof p.identifier === 'object' ? p.identifier?.value : p.identifier;
  if (!p.url || !p.title || id == null) return null;
  return {
    externalId: String(id),
    url: p.url,
    title: p.title,
    company: p.hiringOrganization?.name?.trim() || 'Djinni',
    description: p.description ?? '',
    location: ldLocation(p),
    postedAt: p.datePosted ?? null,
    remoteHint: p.jobLocationType === 'TELECOMMUTE' ? 'remote' : undefined,
  };
}

export const djinniAdapter: SourceAdapter = {
  id: 'djinni',
  async search(params, ctx) {
    const out: RawJob[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = new URLSearchParams();
      if (params.primary_keyword) qs.set('primary_keyword', params.primary_keyword);
      if (page > 1) qs.set('page', String(page));
      const postings = extractJobPostings(await ctx.fetchText(`${BASE}${qs.size ? `?${qs}` : ''}`));
      if (postings.length === 0) break;
      for (const p of postings) {
        const job = toRawJob(p);
        if (job) out.push(job);
      }
    }
    return out;
  },
};
