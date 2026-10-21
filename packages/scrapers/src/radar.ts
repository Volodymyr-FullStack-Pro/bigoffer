import { parseRss } from './rss';

/**
 * The radar: a board's RSS feed for one query, polled every couple of minutes. It only reads the posting ids; a new
 * id makes the pipeline scrape that query at once instead of waiting for its regular slot.
 */
export function radarFeedUrl(sourceId: string, params: Record<string, string>): string | null {
  if (sourceId === 'djinni') {
    const qs = params.primary_keyword ? `?${new URLSearchParams({ primary_keyword: params.primary_keyword })}` : '';
    return `https://djinni.co/jobs/rss/${qs}`;
  }
  if (sourceId === 'dou') {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category) qs.set('category', params.category);
    return `https://jobs.dou.ua/vacancies/feeds/${qs.size ? `?${qs.toString().replace(/\+/g, '%20')}` : ''}`;
  }
  return null;
}

/** Posting ids in a feed, as the adapters store them (Djinni /jobs/<id>-…, DOU /vacancies/<id>). */
export function radarFeedIds(sourceId: string, xml: string): string[] {
  const re = sourceId === 'djinni' ? /djinni\.co\/jobs\/(\d+)/ : sourceId === 'dou' ? /vacancies\/(\d+)/ : null;
  if (!re) return [];
  const ids = parseRss(xml).flatMap((item) => {
    const id = item.link.match(re)?.[1];
    return id ? [id] : [];
  });
  return [...new Set(ids)];
}
