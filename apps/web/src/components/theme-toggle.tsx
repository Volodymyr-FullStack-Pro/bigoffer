'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

// Dark first: it is the default theme.
const ORDER = ['dark', 'light', 'system'] as const;
type ThemeName = (typeof ORDER)[number];

const subscribe = () => () => {};

export function ThemeToggle({ labels }: { labels: Record<ThemeName, string> }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  const current: ThemeName = mounted && ORDER.includes(theme as ThemeName) ? (theme as ThemeName) : 'dark';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'dark';
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      data-theme-current={current}
      aria-label={labels[current]}
      title={labels[current]}
      onClick={() => setTheme(next)}
      className="brutal-press grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
