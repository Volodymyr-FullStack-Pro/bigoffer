import type { RawJob } from '@jp/core';
import { SourceBlockedError, type SourceAdapter } from '../types';

type JoobleResponse = {
  jobs: {
    id: number | string;
    title: string;
    location?: string;
    snippet?: string;
    salary?: string;
    source?: string;
    type?: string;
    link: string;
    company?: string;
    updated?: string;
  }[];
};

function redact(err: unknown, key: string): Error {
  const hide = (t: string) => t.split(key).join('***').split(encodeURIComponent(key)).join('***');
  if (err instanceof SourceBlockedError) {
    const e = new SourceBlockedError(err.status, '***');
    e.message = hide(err.message);
    return e;
  }
  return new Error(hide(err instanceof Error ? err.message : String(err)));
}

export const joobleAdapter: SourceAdapter = {
  id: 'jooble',
  isConfigured: (env) => Boolean(env.JOOBLE_API_KEY),
  async search(params, ctx) {
    const key = ctx.env.JOOBLE_API_KEY;
    if (!key) return [];
    let data: JoobleResponse;
    try {
      data = await ctx.fetchJson<JoobleResponse>(`https://jooble.org/api/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keywords: params.keywords ?? '', location: params.location ?? '', page: '1' }),
      });
    } catch (err) {
      throw redact(err, key);
    }
    return (data.jobs ?? []).map(
      (j): RawJob => ({
        externalId: String(j.id),
        url: j.link,
        title: j.title,
        company: j.company?.trim() || j.source || 'Jooble',
        description: j.snippet ?? '',
        location: j.location || null,
        salaryRaw: j.salary || null,
        postedAt: j.updated ?? null,
        tags: j.type ? [j.type] : [],
      }),
    );
  },
};
