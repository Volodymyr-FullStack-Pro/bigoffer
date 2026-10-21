import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export const STATUS_TONES = ['interview', 'move', 'wait', 'test', 'offer', 'danger', 'neutral'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

/** A tone at rest: a quiet tinted fill with text in the tone (an unpicked filter, a reply's kind). */
export const TONE_PILL: Record<StatusTone, string> = {
  interview: 'bg-status-interview/18 text-status-interview-text',
  move: 'bg-status-move/18 text-status-move-text',
  wait: 'bg-status-wait/20 text-status-wait-text',
  test: 'bg-status-test/18 text-status-test-text',
  offer: 'bg-status-offer/18 text-status-offer-text',
  danger: 'bg-status-danger/18 text-status-danger-text',
  neutral: 'bg-status-neutral/20 text-foreground',
};

/** A tone that speaks: the solid hue with ink on it (a status on a card, a picked filter). */
export const TONE_SOLID: Record<StatusTone, string> = {
  interview: 'bg-status-interview text-white dark:text-[#1d0b14]',
  move: 'bg-status-move text-white dark:text-[#06131d]',
  wait: 'bg-status-wait text-[#1f1300]',
  test: 'bg-status-test text-white dark:text-[#140b26]',
  offer: 'bg-status-offer text-white dark:text-[#04160d]',
  danger: 'bg-status-danger text-white dark:text-[#200808]',
  neutral: 'bg-status-neutral text-white dark:text-[#0f1116]',
};

/** States that wait on you point on (an arrow); the rest are tags pointing back. */
const GO: ReadonlySet<StatusTone> = new Set(['interview', 'move', 'wait']);
export type TagShape = 'tag' | 'tag-go';
export const toneShape = (tone: StatusTone): TagShape => (GO.has(tone) ? 'tag-go' : 'tag');

/** Classes for an option in a tone picker: solid when picked, a quieter tinted tag otherwise. */
export const toneChip = (tone: StatusTone, picked: boolean) =>
  `${toneShape(tone)} transition ${picked ? TONE_SOLID[tone] : `${TONE_PILL[tone]} hover:brightness-125`}`;

/** The tone as a CSS colour, for a card's left edge or a banner's border. */
export const toneColor = (tone: StatusTone) => `var(--status-${tone})`;

export function StatusBadge({ tone, icon: Icon, shape, children, className = '', ...rest }: {
  tone: StatusTone;
  shape?: TagShape;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>) {
  return (
    <span className={`inline-flex items-center gap-1 self-start py-1 text-xs font-bold leading-none ${shape ?? toneShape(tone)} ${TONE_SOLID[tone]} ${className}`} {...rest}>
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />}
      {children}
    </span>
  );
}
