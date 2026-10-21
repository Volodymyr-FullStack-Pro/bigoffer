/**
 * BigOffer "b": a solid mint letter whose bowl carries a pair of eyes looking ahead, at the name. The same drawing is
 * the wordmark's first letter and, on an ink tile, app/icon.svg (favicon) and app/apple-icon.png.
 */
function Glyph() {
  return (
    <>
      <path d="M168 384 V156" fill="none" stroke="#73f7b2" strokeWidth="56" strokeLinecap="round" />
      <circle cx="252" cy="296" r="110" fill="#73f7b2" />
      {[206, 300].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="296" rx="48" ry="66" fill="#fff" />
          <circle cx={x + 16} cy="288" r="27" fill="#0f1116" />
          <circle cx={x + 6.5} cy="276.5" r="9" fill="#fff" />
        </g>
      ))}
    </>
  );
}

/** The app mark on its ink tile (same as the favicon). */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={className}>
      <rect width="512" height="512" rx="116" fill="#1e1d25" />
      <g transform="translate(256 256) scale(1.2) translate(-251 -270)">
        <Glyph />
      </g>
    </svg>
  );
}

/** The wordmark: the mint "b" with eyes, a heavy "ig", a lighter "offer" and a mint full stop (header and sign-in page). */
export function Logo({ name }: { name: string }) {
  return (
    <span aria-label={name} className="flex items-baseline font-display text-[22px] leading-none tracking-[-0.04em]">
      <svg viewBox="112 124 254 288" aria-hidden className="h-[1.3em] w-auto shrink-0">
        <Glyph />
      </svg>
      <span aria-hidden className="ml-[0.03em] font-extrabold text-foreground">ig</span>
      <span aria-hidden className="font-medium text-muted-foreground">offer</span>
      <span aria-hidden className="font-extrabold text-brand">.</span>
    </span>
  );
}
