/**
 * BigOffer mark: an Apple-style squircle in the brand gradient with a lowercase "b" whose stem is an up arrow
 * (BigOffer + career growth). Same drawing as app/icon.svg (favicon) and app/apple-icon.png.
 */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={className}>
      <defs>
        <linearGradient id="bo-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2997ff" />
          <stop offset="0.55" stopColor="#7d5cf0" />
          <stop offset="1" stopColor="#ff375f" />
        </linearGradient>
        <linearGradient id="bo-mark-s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#bo-mark-g)" />
      <rect width="512" height="512" rx="116" fill="url(#bo-mark-s)" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth="62"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(256 262) scale(.8) translate(-240 -248)"
      >
        <path d="M178 382 V118" />
        <path d="M110 186 L178 108 L246 186" />
        <path d="M178 286 a96 96 0 1 1 0 0.01" />
      </g>
    </svg>
  );
}

/** Mark + wordmark, as used in the header and on the sign-in page. */
export function Logo({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
      <LogoMark />
      {name}
    </span>
  );
}
