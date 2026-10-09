'use client';

import { useCallback, useEffect, useRef } from 'react';
import { mergeUiPrefs, type UiPrefs } from './ui-prefs';
import { saveUiPrefs } from './ui-prefs-actions';

/** Returns a saver that batches rapid changes (e.g. several filter clicks) into one write after `delayMs`. */
export function useSaveUiPrefs(delayMs = 400): (patch: UiPrefs) => void {
  const pending = useRef<UiPrefs | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    const patch = pending.current;
    pending.current = null;
    if (patch) void saveUiPrefs(patch).catch(() => undefined);
  }, []);

  // Leaving the page must not drop the last change.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    flush();
  }, [flush]);

  return useCallback(
    (patch: UiPrefs) => {
      pending.current = mergeUiPrefs(pending.current ?? {}, patch);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );
}
