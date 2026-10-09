'use client';

import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/** The logo link; like the nav items it drops focus after a pointer click, so no ring lingers after navigation. */
export function HomeLink({ children }: { children: ReactNode }) {
  return (
    <Link href="/today" onPointerUp={(e) => e.currentTarget.blur()} className="rounded-lg focus-visible:outline-offset-4">
      {children}
    </Link>
  );
}
