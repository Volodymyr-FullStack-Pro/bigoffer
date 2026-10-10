import { kyivLocalDate, type RawJob } from '@jp/core';
import { extractJobPostings, type JobPostingLd, ldLocation } from '../jsonld';
import { isGoneError, type SourceAdapter } from '../types';

const BASE = 'https://djinni.co/jobs/';
const MAX_PAGES = 2;

function toRawJob(p: JobPostingLd): RawJob | null {
  const id = typeof p.identifier === 'object' ? p.identifier?.value : p.identifier;
  if (!p.url || !p.title || id == null) return null;
  const company = p.hiringOrganization?.name?.trim();
  return {
    externalId: String(id),
    url: p.url,
    title: p.title,
    company: company || 'Djinni',
    companyIsPlaceholder: !company,
    description: p.description ?? '',
    location: ldLocation(p),
    postedAt: p.datePosted ? kyivLocalDate(p.datePosted) : null,
    remoteHint: p.jobLocationType === 'TELECOMMUTE' ? 'remote' : undefined,
  };
}

const CLOSED = /вакансі[яи] зараз неактивна|вакансия сейчас неактивна|job is (?:currently )?(?:inactive|not active)/i;

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
  async isOpen(url, ctx) {
    try {
      // A closed job keeps its page but shows "Ця вакансія зараз неактивна" (ru/en variants too).
      return !CLOSED.test(await ctx.fetchText(url));
    } catch (err) {
      return isGoneError(err) ? false : null;
    }
  },
};
