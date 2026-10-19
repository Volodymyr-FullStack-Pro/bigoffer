'use client';

import { Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { NAV_ITEMS } from './nav-items';

/** Phone tab bar: the pages that do not fit as tabs (search settings, library, profile) open from "More". */
export function MoreMenu({ label, labels }: { label: string; labels: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => !i.mobile);
  const active = items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative flex flex-1">
      <button
        type="button"
        data-testid="nav-more"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active || open ? 'text-link' : 'text-muted-foreground'}`}
      >
        <Ellipsis aria-hidden className="size-5" />
        <span>{label}</span>
      </button>
      {open && (
        <div role="menu" className="glass absolute right-2 bottom-full mb-2 flex min-w-48 flex-col rounded-2xl border border-border p-1.5 shadow-xl">
          {items.map(({ key, href, icon: Icon }) => {
            const current = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={key}
                role="menuitem"
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${current ? 'font-semibold text-link' : 'hover:bg-muted'}`}
              >
                <Icon aria-hidden className="size-4" />
                {labels[key]}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
