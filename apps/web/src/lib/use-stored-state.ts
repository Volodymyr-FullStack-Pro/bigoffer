'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Same-tab writers notify these; other tabs arrive through the 'storage' event.
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * State that survives a reload (an unsent draft, a pasted form): kept in localStorage under `key`, the server render
 * and the first client render use `initial`. Setting it back to `initial` (or '') forgets the draft. A null key keeps
 * nothing.
 */
export function useStoredState(key: string | null, initial: string): [string, (value: string) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    window.addEventListener('storage', onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => (key ? read(key) : null), () => null);
  let value = initial;
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      value = typeof parsed === 'string' ? parsed : initial;
    } catch {
      value = initial;
    }
  }
  const set = useCallback(
    (next: string) => {
      if (!key) return;
      try {
        if (next === initial || next === '') localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage blocked (private mode): the draft just isn't kept
      }
      listeners.forEach((l) => l());
    },
    [key, initial],
  );
  return [value, set];
}

/** Puts `value` in the page URL under `param` (or removes it) without a navigation, so a reload reopens the same view. */
export function setUrlParam(param: string, value: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(param);
    else url.searchParams.set(param, value);
    // A null state (not Next's own) makes the router adopt the new URL; passing its state back would make it skip the
    // sync and restore the old URL on the next server action.
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
  } catch {
    // not in a browser
  }
}
