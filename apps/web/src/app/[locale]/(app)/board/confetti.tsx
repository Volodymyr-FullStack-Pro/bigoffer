'use client';

import { motion, useReducedMotion } from 'motion/react';

const COLORS = ['var(--brand)', 'var(--ai)', 'var(--success)', 'var(--warning)'];

/** Short brutalist confetti burst for an offer (spec 7.8); nothing with reduced motion. */
export function Confetti({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div data-testid="confetti" aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute top-1/3 left-1/2 h-3 w-2 border border-border"
          style={{ background: COLORS[i % COLORS.length] }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: (i % 2 ? 1 : -1) * (60 + ((i * 37) % 260)), y: 200 + ((i * 53) % 300), rotate: (i * 47) % 360, opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          onAnimationComplete={i === 0 ? onDone : undefined}
        />
      ))}
    </div>
  );
}
