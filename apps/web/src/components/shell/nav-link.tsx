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
          ? `relative flex flex-1 flex-col items-center gap-0.5 py-2 font-mono text-[11px] ${
              active ? 'font-bold text-foreground before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:bg-brand' : 'text-muted-foreground'
            }`
          : `mono-label relative flex items-center gap-3 rounded-brutal px-3 py-2 transition-colors ${
              active
                ? 'bg-muted font-bold text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.75 before:rounded-full before:bg-brand'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`
      }
    >
      <Icon className={compact ? 'size-5' : 'size-4'} aria-hidden />
      <span>{label}</span>
      {badge && !compact && (
        <span className="ml-auto rounded-sm bg-ai px-1.5 font-mono text-[10px] uppercase text-ai-foreground">
          {badge}
        </span>
      )}
    </Link>
  );
}
