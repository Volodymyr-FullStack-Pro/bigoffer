'use client';

import { useEffect, useRef, useState } from 'react';

const EYES = [206, 300];
const REACH = 16;

/**
 * The BigOffer "b" at hero size, its eyes following the pointer: the brand doing what the product does — watching.
 * Still for reduced motion and on touch screens (the eyes keep the logo's forward glance).
 */
export function WatchingB({ className = '' }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 16, y: 0 });
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
        setLook({ x: (dx / d) * REACH * k, y: (dy / d) * REACH * 1.4 * k });
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
      <path d="M168 384 V156" fill="none" stroke="var(--brand)" strokeWidth="56" strokeLinecap="round" />
      <circle cx="252" cy="296" r="110" fill="var(--brand)" />
      {EYES.map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="296" rx="48" ry="66" fill="#fff" />
          <g style={{ transform: `translate(${look.x}px, ${look.y + 8}px)`, transition: 'transform 120ms ease-out' }}>
            <circle cx={x} cy="280" r="27" fill="#0f1116" />
            <circle cx={x - 9.5} cy="268.5" r="9" fill="#fff" />
          </g>
        </g>
      ))}
    </svg>
  );
}
