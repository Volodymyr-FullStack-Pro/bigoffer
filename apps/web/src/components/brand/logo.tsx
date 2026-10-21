/**
 * BigOffer mark: an ink "terminal" squircle with a mint lowercase "b" whose stem is an up arrow (career growth) and a
 * cursor block. Same drawing as app/icon.svg (favicon) and app/apple-icon.png.
 */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={className}>
      <rect width="512" height="512" rx="116" fill="#1e1d25" />
      <rect x="10" y="10" width="492" height="492" rx="106" fill="none" stroke="#73f7b2" strokeOpacity=".28" strokeWidth="12" />
      <g fill="none" stroke="#73f7b2" strokeWidth="54" strokeLinecap="round" strokeLinejoin="round">
        <path d="M168 372 V140" />
        <path d="M110 198 L168 132 L226 198" />
        <path d="M168 292 a80 80 0 1 1 0 0.01" />
      </g>
      <rect x="330" y="356" width="92" height="34" rx="8" fill="#73f7b2" className="motion-safe:animate-pulse" />
    </svg>
  );
}

/**
 * The mark's "b" on its own (arrow stem and bowl, no tile), drawn in the text colour so it can stand in for the first
 * letter of the wordmark. Its bottom sits on the text baseline.
 */
function LogoGlyph() {
  return (
    <svg viewBox="87 109 264 286" aria-hidden className="h-[0.74em] w-auto shrink-0 text-foreground">
      <g fill="none" stroke="currentColor" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round">
        <path d="M168 372 V140" />
        <path d="M110 198 L168 132 L226 198" />
        <path d="M168 292 a80 80 0 1 1 0 0.01" />
      </g>
    </svg>
  );
}

/** The wordmark: the mark's "b", a heavy "ig", a lighter "offer" and a mint full stop (header and sign-in page). */
export function Logo({ name }: { name: string }) {
  return (
    <span aria-label={name} className="flex items-baseline font-display text-[22px] leading-none tracking-[-0.04em]">
      <LogoGlyph />
      <span aria-hidden className="ml-[0.04em] font-extrabold text-foreground">ig</span>
      <span aria-hidden className="font-medium text-muted-foreground">offer</span>
      <span aria-hidden className="font-extrabold text-brand">.</span>
    </span>
  );
}
