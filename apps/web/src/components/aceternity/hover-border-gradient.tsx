'use client';
// Adapted from Aceternity UI (https://ui.aceternity.com, Aceternity License: use in end products; no resale as a component library).

import { motion, useReducedMotion } from 'motion/react';
import { type ButtonHTMLAttributes, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Direction = 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT';
const ORDER: Direction[] = ['TOP', 'LEFT', 'BOTTOM', 'RIGHT'];

const MOVING: Record<Direction, string> = {
  TOP: 'radial-gradient(20.7% 50% at 50% 0%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)',
  LEFT: 'radial-gradient(16.6% 43.1% at 0% 50%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)',
  BOTTOM: 'radial-gradient(20.7% 50% at 50% 100%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)',
  RIGHT: 'radial-gradient(16.2% 41.2% at 100% 50%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)',
};
const HIGHLIGHT = 'radial-gradient(75% 181% at 50% 50%, #2997ff 0%, rgba(255, 255, 255, 0) 100%)';

/** A pill button whose border carries a light that travels around it; brand-filled inside. */
export function HoverBorderGradient({
  children,
  className,
  containerClassName,
  duration = 1,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { containerClassName?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState<Direction>('TOP');

  useEffect(() => {
    if (hovered || reduce || props.disabled) return;
    const id = setInterval(() => setDirection((d) => ORDER[(ORDER.indexOf(d) + 3) % 4]!), duration * 1000);
    return () => clearInterval(id);
  }, [hovered, reduce, duration, props.disabled]);

  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('group relative flex w-fit items-center justify-center overflow-visible rounded-full bg-brand/40 p-px transition disabled:opacity-60', containerClassName)}
      {...props}
    >
      <span className={cn('relative z-10 rounded-[inherit] bg-brand px-5 py-2 text-[15px] font-medium text-brand-foreground', className)}>{children}</span>
      <motion.span
        aria-hidden
        className="absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
        style={{ filter: 'blur(2px)' }}
        initial={{ background: MOVING[direction] }}
        animate={{ background: hovered ? [MOVING[direction], HIGHLIGHT] : MOVING[direction] }}
        transition={{ ease: 'linear', duration }}
      />
    </button>
  );
}
