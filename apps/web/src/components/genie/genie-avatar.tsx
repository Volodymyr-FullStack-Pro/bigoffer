'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { GenieMood } from '@/lib/genie/brain';

const MOUTH: Record<GenieMood, string> = {
  happy: 'M27 41 Q33 47 39 41',
  excited: 'M26 40 Q33 50 40 40 Z',
  neutral: 'M28 42 Q33 44 38 42',
  worried: 'M28 44 Q33 40 38 44',
};

/**
 * Offer Genie: a mint genie rising from a smoke tail, ink face, a top-knot and a sparkle. Floats while idle, blinks,
 * bounces when excited and sways when worried. Static when the OS asks for reduced motion.
 */
export function GenieAvatar({ mood, size = 64 }: { mood: GenieMood; size?: number }) {
  const still = useReducedMotion();
  const body = still
    ? {}
    : mood === 'excited'
      ? { y: [0, -10, 0, -6, 0], rotate: [0, -4, 4, 0] }
      : mood === 'worried'
        ? { x: [0, -2, 2, -1, 0], y: [0, -2, 0] }
        : { y: [0, -5, 0] };
  return (
    <motion.svg
      viewBox="0 0 66 80"
      width={size}
      height={(size * 80) / 66}
      aria-hidden
      animate={body}
      transition={{ duration: mood === 'excited' ? 1.2 : mood === 'worried' ? 0.8 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
      className="drop-shadow-[0_6px_18px_rgb(115_247_178/0.35)]"
    >
      <defs>
        <linearGradient id="genie-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9dfbc9" />
          <stop offset="60%" stopColor="#73f7b2" />
          <stop offset="100%" stopColor="#98d0b9" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {/* smoke tail */}
      <motion.path
        d="M33 56 C22 62 24 70 34 70 C44 70 46 76 38 79"
        fill="none"
        stroke="#98d0b9"
        strokeWidth="7"
        strokeLinecap="round"
        animate={still ? {} : { d: ['M33 56 C22 62 24 70 34 70 C44 70 46 76 38 79', 'M33 56 C44 62 42 70 32 70 C22 70 20 76 28 79', 'M33 56 C22 62 24 70 34 70 C44 70 46 76 38 79'] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* body + head */}
      <path d="M33 8 C49 8 56 20 54 34 C52 47 44 58 33 60 C22 58 14 47 12 34 C10 20 17 8 33 8 Z" fill="url(#genie-body)" />
      {/* arms */}
      <path d="M13 38 C6 36 4 30 8 27" fill="none" stroke="#73f7b2" strokeWidth="5" strokeLinecap="round" />
      <path d="M53 38 C60 36 62 30 58 27" fill="none" stroke="#73f7b2" strokeWidth="5" strokeLinecap="round" />
      {/* top-knot */}
      <path d="M33 8 C30 3 34 0 37 2 C35 3 35 6 33 8 Z" fill="#1e1d25" />
      {/* face plate */}
      <ellipse cx="33" cy="34" rx="15" ry="13" fill="#1e1d25" />
      {/* eyes */}
      <motion.g animate={still ? {} : { scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.9, 0.95, 1] }} style={{ originY: '32px' }}>
        {mood === 'excited' ? (
          <>
            <path d="M24 33 Q27 28 30 33" fill="none" stroke="#73f7b2" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M36 33 Q39 28 42 33" fill="none" stroke="#73f7b2" strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="27" cy={mood === 'worried' ? 33 : 32} rx="2.6" ry="3.2" fill="#73f7b2" />
            <ellipse cx="39" cy={mood === 'worried' ? 33 : 32} rx="2.6" ry="3.2" fill="#73f7b2" />
          </>
        )}
      </motion.g>
      {mood === 'worried' && (
        <>
          <path d="M23 27 L30 29" stroke="#73f7b2" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M43 27 L36 29" stroke="#73f7b2" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      <path d={MOUTH[mood]} fill={mood === 'excited' ? '#73f7b2' : 'none'} stroke="#73f7b2" strokeWidth="2" strokeLinecap="round" />
      {/* sparkle */}
      <motion.path
        d="M56 6 L57.5 10 L61.5 11.5 L57.5 13 L56 17 L54.5 13 L50.5 11.5 L54.5 10 Z"
        fill="#fefdff"
        animate={still ? {} : { opacity: [0.2, 1, 0.2], scale: [0.8, 1.1, 0.8] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        style={{ originX: '56px', originY: '11.5px' }}
      />
    </motion.svg>
  );
}

/** The folded state: a small lamp the genie lives in. */
export function GenieLamp({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 32" width={size} height={(size * 32) / 48} aria-hidden>
      <path d="M6 18 C6 12 14 10 22 12 L32 12 C36 12 38 9 42 8 C40 12 40 15 36 18 C34 24 28 26 20 26 C12 26 6 24 6 18 Z" fill="#73f7b2" />
      <path d="M14 26 L30 26 L28 30 L16 30 Z" fill="#98d0b9" />
      <path d="M2 16 C4 14 6 15 6 18" fill="none" stroke="#73f7b2" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 12 C20 8 24 7 25 10" fill="none" stroke="#1e1d25" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
