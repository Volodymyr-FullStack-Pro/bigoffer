import type { BoardCard } from './board-types';
import type { ReplyKind } from './reply-kinds';

export type BoardFilter = { query: string; labelIds: string[]; reply: ReplyKind | 'none' | null };

export const EMPTY_FILTER: BoardFilter = { query: '', labelIds: [], reply: null };

export const isFiltering = (f: BoardFilter) => f.query.trim() !== '' || f.labelIds.length > 0 || f.reply !== null;

const fold = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[’'`ʼ]/g, '');

/** Every search word must appear in the company, title, contact or notes; any chosen label; the chosen reply kind. */
export function matchesFilter(card: BoardCard, f: BoardFilter): boolean {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = fold([card.company, card.title, card.contactName ?? '', card.notes ?? ''].join(' '));
    if (!words.every((w) => hay.includes(w))) return false;
  }
  if (f.labelIds.length && !f.labelIds.some((id) => card.labelIds.includes(id))) return false;
  if (f.reply === 'none') return card.replyKind === null;
  if (f.reply) return card.replyKind === f.reply;
  return true;
}
