import type { ReactNode } from 'react';

export const STATUS_TONES = ['interview', 'move', 'wait', 'test', 'offer', 'danger', 'neutral'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

/** Tinted pill per tone: a soft fill, text in the tone, a thin ring; reads the same in light and dark themes. */
export const TONE_PILL: Record<StatusTone, string> = {
  interview: 'bg-status-interview/15 text-status-interview ring-status-interview/30',
  move: 'bg-status-move/15 text-status-move ring-status-move/30',
  wait: 'bg-status-wait/15 text-status-wait ring-status-wait/35',
  test: 'bg-status-test/15 text-status-test ring-status-test/30',
  offer: 'bg-status-offer/20 text-status-offer ring-status-offer/35',
  danger: 'bg-status-danger/15 text-status-danger ring-status-danger/30',
  neutral: 'bg-status-neutral/15 text-muted-foreground ring-status-neutral/25',
};

/** The tone as a CSS colour, for a card's left edge or a banner's border. */
export const toneColor = (tone: StatusTone) => `var(--status-${tone})`;

export function StatusBadge({ tone, icon, children, className = '', ...rest }: {
  tone: StatusTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>) {
  return (
    <span className={`inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE_PILL[tone]} ${className}`} {...rest}>
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}
