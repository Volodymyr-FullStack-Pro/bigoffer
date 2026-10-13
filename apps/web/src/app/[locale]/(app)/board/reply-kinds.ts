import { REPLY_KINDS, type ReplyKind } from '@jp/ai';

export { REPLY_KINDS, type ReplyKind };

/** Card badge colours per reply kind: grey means "nothing real yet", warm colours need the candidate. */
export const REPLY_STYLE: Record<ReplyKind, { bg: string; fg: string; icon: string }> = {
  auto_reply: { bg: '#D4D4D8', fg: '#18181B', icon: '🤖' },
  question: { bg: '#38BDF8', fg: '#0C1A24', icon: '❓' },
  interview_invite: { bg: '#F472B6', fg: '#2A0A1B', icon: '📅' },
  test_task: { bg: '#7B5CFF', fg: '#FFFFFF', icon: '🧩' },
  offer: { bg: '#C6F432', fg: '#16200A', icon: '🎉' },
  rejection: { bg: '#EF4444', fg: '#FFFFFF', icon: '✕' },
  other: { bg: '#F5F5F4', fg: '#18181B', icon: '💬' },
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
