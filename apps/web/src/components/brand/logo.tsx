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

/** Mark + "BigOffer." wordmark (mono, mint full stop), as used in the header and on the sign-in page. */
export function Logo({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
      <LogoMark />
      <span>
        {name}
        <span className="text-brand">.</span>
      </span>
    </span>
  );
}
