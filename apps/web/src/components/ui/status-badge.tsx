import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export const STATUS_TONES = ['interview', 'move', 'wait', 'test', 'offer', 'danger', 'neutral'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

/** Tinted pill per tone: a clear fill, text in the tone and a ring; reads the same in light and dark themes. */
export const TONE_PILL: Record<StatusTone, string> = {
  interview: 'bg-status-interview/30 text-status-interview-text ring-status-interview/75',
  move: 'bg-status-move/30 text-status-move-text ring-status-move/75',
  wait: 'bg-status-wait/30 text-status-wait-text ring-status-wait/80',
  test: 'bg-status-test/30 text-status-test-text ring-status-test/75',
  offer: 'bg-status-offer/30 text-status-offer-text ring-status-offer/80',
  danger: 'bg-status-danger/30 text-status-danger-text ring-status-danger/75',
  neutral: 'bg-status-neutral/30 text-foreground ring-status-neutral/70',
};

/** The picked option of a tone picker: a solid fill with contrasting text and a soft halo. */
export const TONE_SOLID: Record<StatusTone, string> = {
  interview: 'bg-status-interview text-white ring-status-interview shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-interview)_35%,transparent)] dark:text-[#1d0b14]',
  move: 'bg-status-move text-white ring-status-move shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-move)_35%,transparent)] dark:text-[#06131d]',
  wait: 'bg-status-wait text-white ring-status-wait shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-wait)_35%,transparent)] dark:text-[#1f1300]',
  test: 'bg-status-test text-white ring-status-test shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-test)_35%,transparent)] dark:text-[#140b26]',
  offer: 'bg-status-offer text-white ring-status-offer shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-offer)_35%,transparent)] dark:text-[#141d05]',
  danger: 'bg-status-danger text-white ring-status-danger shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-danger)_35%,transparent)] dark:text-[#200808]',
  neutral: 'bg-foreground text-background ring-foreground shadow-[0_0_0_3px_color-mix(in_srgb,var(--foreground)_25%,transparent)]',
};

/** Classes for an option in a tone picker: solid when picked, a quieter tinted pill otherwise. */
export const toneChip = (tone: StatusTone, picked: boolean) =>
  `ring-1 ring-inset transition ${picked ? `${TONE_SOLID[tone]} ring-2` : `${TONE_PILL[tone]} opacity-90 hover:opacity-100`}`;

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
