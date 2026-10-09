'use client';

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
                ? 'bg-muted font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`
      }
    >
      <Icon className={compact ? 'size-5' : 'size-4'} aria-hidden />
      <span>{label}</span>
      {badge && !compact && (
        <span className="ml-auto rounded-full bg-ai/15 px-2 py-0.5 text-[11px] font-medium text-ai">
          {badge}
        </span>
      )}
    </Link>
  );
}
