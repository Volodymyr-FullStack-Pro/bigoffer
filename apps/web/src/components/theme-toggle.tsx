'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const ORDER = ['system', 'light', 'dark'] as const;
type ThemeName = (typeof ORDER)[number];

const subscribe = () => () => {};

export function ThemeToggle({ labels }: { labels: Record<ThemeName, string> }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  const current: ThemeName = mounted && ORDER.includes(theme as ThemeName) ? (theme as ThemeName) : 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system';
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      data-theme-current={current}
      aria-label={labels[current]}
      title={labels[current]}
      onClick={() => setTheme(next)}
      className="brutal brutal-press grid size-10 place-items-center"
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
