import { cn } from '@/lib/utils';

/** Brand-ish colour per technology (text + tinted fill), like tag chips on job boards; unknown ones stay neutral. */
const TECH: Record<string, string> = {
  react: '#61dafb', 'react native': '#61dafb', 'next.js': '#e5e5e5', typescript: '#5aa2ff', javascript: '#f7df1e',
  'node.js': '#7cc74f', nestjs: '#ff5a76', express: '#cfcfcf', graphql: '#ff6ac1', vue: '#42d392', 'vue.js': '#42d392',
  angular: '#ff4f5e', svelte: '#ff7a45', redux: '#a48bff', 'redux toolkit': '#a48bff', mobx: '#ff9a3c', zustand: '#d8b46a',
  tailwind: '#38bdf8', 'tailwind css': '#38bdf8', css: '#5aa2ff', html: '#ff7043', html5: '#ff7043', python: '#ffd54f',
  django: '#4fc08d', java: '#ff8a50', 'c#': '#b388ff', '.net': '#b388ff', go: '#4dd0e1', golang: '#4dd0e1', php: '#9fa8ff',
  postgresql: '#6fa8ff', mysql: '#4fc3f7', mongodb: '#69d36e', redis: '#ff6b6b', docker: '#4aa8ff', kubernetes: '#6e9bff',
  aws: '#ffb74d', gcp: '#7aa7ff', azure: '#4fb3ff', supabase: '#5fe3a1', prisma: '#c3c8ff', figma: '#ff7262',
  jest: '#ff6b81', playwright: '#7bd88f', cypress: '#cfd8dc', git: '#ff7043', flutter: '#5ac8fa', swift: '#ff8a65',
  kotlin: '#b388ff', 'rest api': '#cfd8dc', 'rest apis': '#cfd8dc', websockets: '#cfd8dc', stripe: '#8f8cff',
};

/** Chip text: the brand colour as is on the dark canvas, deepened toward the ink on white so it stays readable. */
const ink = (c: string) => `color-mix(in srgb, ${c} var(--chip-ink), var(--foreground))`;

export function techColor(name: string): string | null {
  return TECH[name.trim().toLowerCase()] ?? null;
}

export function TechChip({ name, dim = false, className }: { name: string; dim?: boolean; className?: string }) {
  const c = techColor(name);
  return (
    <span
      className={cn('inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium', dim && 'opacity-60', className)}
      style={c ? { color: ink(c), borderColor: `${c}55`, backgroundColor: `${c}14` } : undefined}
    >
      {name}
    </span>
  );
}

const LEVEL: Record<string, string> = { intern: '#7cc74f', junior: '#7cc74f', middle: '#ffc24d', senior: '#ff6b6b', lead: '#c084fc' };

/** Junior green, Middle amber, Senior red, Lead violet. */
export function LevelBadge({ level, label }: { level: string; label: string }) {
  const c = LEVEL[level] ?? '#b3b2b9';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold" style={{ color: ink(c), borderColor: `${c}55`, backgroundColor: `${c}14` }}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {label}
    </span>
  );
}
