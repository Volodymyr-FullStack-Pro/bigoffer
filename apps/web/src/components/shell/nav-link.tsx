'use client';

import { Loader2 } from 'lucide-react';
import { useLinkStatus } from 'next/link';
import { Link, usePathname } from '@/i18n/navigation';
import { NAV_ITEMS, type NavKey } from './nav-items';

export function NavLink({
  navKey,
  label,
  badge,
  compact = false,
}: {
  navKey: NavKey;
  label: string;
  badge?: string;
  compact?: boolean;
}) {
  const { href, icon: Icon } = NAV_ITEMS.find((item) => item.key === navKey)!;
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // A mouse/touch click must not leave a focus ring on the item after navigation; keyboard focus stays.
      onPointerUp={(e) => e.currentTarget.blur()}
      className={
        compact
          ? `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-link' : 'text-muted-foreground'}`
          : `mono-label flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
              active
                ? 'font-semibold text-link underline decoration-2 underline-offset-8'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`
      }
    >
      <NavIcon icon={Icon} compact={compact} />
      <span>{label}</span>
      {badge && !compact && (
        <span className="ml-auto rounded-full bg-ai/15 px-2 py-0.5 text-xs font-medium text-ai">
          {badge}
        </span>
      )}
    </Link>
  );
}

/** The item's icon, swapped for a spinner while its page is loading (the click is acknowledged at once). */
function NavIcon({ icon: Icon, compact }: { icon: (typeof NAV_ITEMS)[number]['icon']; compact: boolean }) {
  const { pending } = useLinkStatus();
  const size = compact ? 'size-5' : 'size-4';
  return pending ? <Loader2 data-testid="nav-pending" className={`${size} animate-spin text-link`} aria-hidden /> : <Icon className={size} aria-hidden />;
}
