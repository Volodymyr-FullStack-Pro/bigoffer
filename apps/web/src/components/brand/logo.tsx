import { useId } from 'react';

/**
 * BigOffer "b": a solid mint letter whose bowl is a happy face — eyes looking up and ahead, an open smile with a row of
 * teeth. The same drawing is the wordmark's first letter, the favicon (app/icon.svg) and the landing's watching b.
 */
export function Glyph({ look = { x: 8, y: -10 } }: { look?: { x: number; y: number } }) {
  const clip = useId();
  return (
    <>
      <path d="M168 384 V156" fill="none" stroke="#73f7b2" strokeWidth="56" strokeLinecap="round" />
      <circle cx="252" cy="296" r="110" fill="#73f7b2" />
      {[206, 298].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="262" rx="40" ry="46" fill="#fff" />
          <g style={{ transform: `translate(${look.x}px, ${look.y}px)`, transition: 'transform 120ms ease-out' }}>
            <circle cx={x} cy="262" r="22" fill="#0f1116" />
            <circle cx={x - 8} cy="252" r="8" fill="#fff" />
          </g>
        </g>
      ))}
      <clipPath id={clip}>
        <path d="M196 330 Q252 392 308 330 Z" />
      </clipPath>
      <path d="M196 330 Q252 392 308 330 Z" fill="#0f1116" />
      <rect x="196" y="330" width="112" height="14.5" fill="#fff" clipPath={`url(#${clip})`} />
    </>
  );
}

/** The "O" of "Offer": a mint coin seen slightly from above, its edge showing, a dark-green dollar struck on it. */
export function Coin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <ellipse cx="50" cy="58" rx="46" ry="42" fill="#3fbf82" />
      <ellipse cx="50" cy="50" rx="46" ry="42" fill="#73f7b2" />
      <text x="50" y="74" textAnchor="middle" fontFamily="var(--font-geist), Arial, sans-serif" fontWeight="800" fontSize="72" fill="#0b6b42">
        $
      </text>
    </svg>
  );
}

/** The app mark on its ink tile (same as the favicon). */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={className}>
      <rect width="512" height="512" rx="116" fill="#1e1d25" />
      <g transform="translate(256 256) scale(1.12) translate(-249 -262)">
        <Glyph />
      </g>
    </svg>
  );
}

/**
 * The wordmark "bigOffer": the happy b, "ig", a dollar coin for the O and "ffer", with a rounded mint stroke under the
 * offer — joy and money in one line (header, sign-in page, landing).
 */
export function Logo({ name, className = 'text-[24px]' }: { name: string; className?: string }) {
  return (
    <span aria-label={name} className={`flex items-baseline font-display font-extrabold leading-none tracking-[-0.04em] text-foreground ${className}`}>
      <svg viewBox="112 124 254 288" aria-hidden className="h-[1.15em] w-auto shrink-0">
        <Glyph />
      </svg>
      <span aria-hidden className="ml-[0.03em]">ig</span>
      <span aria-hidden className="relative inline-flex items-baseline">
        <Coin className="mx-[0.03em] h-[0.98em] w-[0.98em] shrink-0 translate-y-[0.1em]" />
        ffer
        <span className="absolute inset-x-0 -bottom-[0.18em] h-[0.12em] rounded-full bg-brand" />
      </span>
    </span>
  );
}
