import { REPLY_STYLE, type ReplyKind } from './reply-kinds';

/** The reply kind's icon at chip size. */
export function ReplyIcon({ kind, className = 'size-3.5' }: { kind: ReplyKind; className?: string }) {
  const Icon = REPLY_STYLE[kind].icon;
  return <Icon aria-hidden className={`inline shrink-0 ${className}`} strokeWidth={2.25} />;
}
