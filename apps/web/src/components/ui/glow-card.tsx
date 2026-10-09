'use client';

import type { ReactNode } from 'react';
import { GlowingEffect } from '@/components/aceternity/glowing-effect';
import { cn } from '@/lib/utils';

/** Wraps a card so its border lights up toward the pointer (decoration only; off on touch and reduced motion). */
export function GlowCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative rounded-[18px]', className)}>
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      {children}
    </div>
  );
}
