import { REPLY_KINDS, type ReplyKind } from '@jp/ai';
import type { StatusTone } from '@/components/ui/status-badge';

export { REPLY_KINDS, type ReplyKind };

/** Badge tone per reply kind: neutral means "nothing real yet", colours need the candidate. */
export const REPLY_STYLE: Record<ReplyKind, { tone: StatusTone; icon: string }> = {
  auto_reply: { tone: 'neutral', icon: '🤖' },
  question: { tone: 'move', icon: '❓' },
  interview_invite: { tone: 'interview', icon: '📅' },
  test_task: { tone: 'test', icon: '🧩' },
  offer: { tone: 'offer', icon: '🎉' },
  rejection: { tone: 'danger', icon: '✕' },
  other: { tone: 'neutral', icon: '💬' },
};

export const isReplyKind = (v: unknown): v is ReplyKind => typeof v === 'string' && (REPLY_KINDS as readonly string[]).includes(v);

/**
 * The board column a reply should move the card to (by column key or kind), or null to leave it. A plain answer or a
 * question moves a card waiting in Saved/Applied to "In talks"; an auto-reply moves nothing.
 */
export function columnForReply(kind: ReplyKind, fromKey: string): { key: string } | { kind: 'won' | 'lost' } | null {
  if ((kind === 'question' || kind === 'other') && (fromKey === 'saved' || fromKey === 'applied')) return { key: 'talking' };
  if (kind === 'interview_invite') return { key: 'interview' };
  if (kind === 'test_task') return { key: 'test_task' };
  if (kind === 'offer') return { kind: 'won' };
  if (kind === 'rejection') return { kind: 'lost' };
  return null;
}
