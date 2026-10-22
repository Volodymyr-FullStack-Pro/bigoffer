'use client';

import { useEffect, useRef, useState } from 'react';
import { Glyph } from '@/components/brand/logo';

const REACH = 12;

/**
 * The happy BigOffer "b" at hero size, its eyes following the pointer: the brand doing what the product does — watching.
 * Still for reduced motion and on touch screens (the eyes keep the logo's forward glance).
 */
export function WatchingB({ className = '' }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 8, y: -10 });
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        const dx = e.clientX - (box.left + box.width * 0.6);
        const dy = e.clientY - (box.top + box.height * 0.62);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 260);
        setLook({ x: (dx / d) * REACH * k, y: (dy / d) * REACH * 1.2 * k });
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);
  return (
    <svg ref={ref} viewBox="112 124 254 288" aria-hidden className={className}>
      <Glyph look={look} />
    </svg>
  );
}
