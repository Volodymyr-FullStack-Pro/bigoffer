import type { RawJob } from '@jp/core';
import { load } from 'cheerio';
import type { SourceAdapter } from '../types';

const MIN_TEXT = 80;
const JOBBY = /vacanc|вакансі|ваканс|hiring|шукаємо|ищем|looking for|position|developer|engineer|розробник|разработчик|junior|middle|senior|стаж|intern/i;

/** Public channel preview (t.me/s/<channel>): each post becomes a job candidate; AI enrichment drops non-jobs. */
export const telegramAdapter: SourceAdapter = {
  id: 'telegram',
  async search(params, ctx) {
    const channel = params.board;
    if (!channel || !/^[A-Za-z0-9_]{4,64}$/.test(channel)) return [];
    const $ = load(await ctx.fetchText(`https://t.me/s/${channel}`));
    const channelTitle = $('meta[property="og:title"]').attr('content')?.trim() || channel;
    // A missing or renamed channel redirects to a 200 page without any posts: that is a dead board, not an empty one.
    if ($('.tgme_widget_message').length === 0) throw new Error(`Telegram channel ${channel} has no public posts`);
    const jobs: RawJob[] = [];
    $('.tgme_widget_message[data-post]').each((_, el) => {
      const post = $(el).attr('data-post') ?? '';
      const [name, id] = post.split('/');
      const textEl = $(el).find('.tgme_widget_message_text').first();
      textEl.find('br').replaceWith('\n');
      const text = textEl.text().replace(/\n{3,}/g, '\n\n').trim();
      if (!name || !id || !/^[A-Za-z0-9_]+$/.test(name) || name.toLowerCase() !== channel.toLowerCase() || !/^\d+$/.test(id) || text.length < MIN_TEXT || !JOBBY.test(text)) return;
      const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 3) ?? text.slice(0, 80);
      jobs.push({
        externalId: `${name}/${id}`,
        url: `https://t.me/${name}/${id}`,
        title: firstLine.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 200) || firstLine.slice(0, 200),
        company: channelTitle,
        companyIsPlaceholder: true,
        description: text,
        postedAt: $(el).find('time[datetime]').first().attr('datetime') ?? null,
      });
    });
    return jobs;
  },
};
