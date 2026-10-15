import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export const STATUS_TONES = ['interview', 'move', 'wait', 'test', 'offer', 'danger', 'neutral'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

/** Tinted pill per tone: a soft fill, text in the tone, a thin ring; reads the same in light and dark themes. */
export const TONE_PILL: Record<StatusTone, string> = {
  interview: 'bg-status-interview/25 text-status-interview ring-status-interview/55',
  move: 'bg-status-move/25 text-status-move ring-status-move/55',
  wait: 'bg-status-wait/25 text-status-wait ring-status-wait/60',
  test: 'bg-status-test/25 text-status-test ring-status-test/55',
  offer: 'bg-status-offer/25 text-status-offer ring-status-offer/60',
  danger: 'bg-status-danger/25 text-status-danger ring-status-danger/55',
  neutral: 'bg-status-neutral/20 text-foreground/80 ring-status-neutral/40',
};

/** The tone as a CSS colour, for a card's left edge or a banner's border. */
export const toneColor = (tone: StatusTone) => `var(--status-${tone})`;

export function StatusBadge({ tone, icon: Icon, children, className = '', ...rest }: {
  tone: StatusTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>) {
  return (
    <span className={`inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_PILL[tone]} ${className}`} {...rest}>
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />}
      {children}
    </span>
  );
}
