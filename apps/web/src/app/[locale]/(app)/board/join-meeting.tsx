'use client';

import { Video } from 'lucide-react';
/** Opens the interview call in a new tab; on a board card it must not open the panel or start a drag. */
export function JoinMeeting({ url, label, testId, compact = false }: { url: string; label: string; testId: string; compact?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      title={url}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={`btn brutal-press inline-flex items-center gap-1 bg-status-interview font-semibold text-white dark:text-[#2a0a1b] ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}
    >
      <Video aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} /> {label}
    </a>
  );
}
