'use client';

import { Download } from 'lucide-react';
import { useEffect } from 'react';

/** Opens the print dialog once on arrival ("Save as PDF"), and keeps a button for another try; never printed itself. */
export function PrintBar({ label, hint }: { label: string; hint: string }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
      <p className="text-sm text-[#4b4b55]">{hint}</p>
      <button type="button" data-testid="cv-print" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[#16161a] px-4 py-2 text-sm font-semibold text-white">
        <Download aria-hidden className="size-4" />
        {label}
      </button>
    </div>
  );
}
