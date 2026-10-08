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
      className={
        compact
          ? `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'font-bold' : 'text-muted-foreground'}`
          : `flex items-center gap-3 rounded-brutal border-2 px-3 py-2 font-semibold ${
              active ? 'border-border bg-brand text-brand-foreground shadow-[3px_3px_0_var(--shadow-color)]' : 'border-transparent hover:border-border'
            }`
      }
    >
      <Icon className={compact ? 'size-5' : 'size-4'} aria-hidden />
      <span>{label}</span>
      {badge && !compact && (
        <span className="ml-auto rounded-sm bg-ai px-1.5 font-mono text-[10px] uppercase text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
