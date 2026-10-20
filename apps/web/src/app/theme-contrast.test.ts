import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Text in both themes must read: WCAG 2 ratio ≥ 4.5 and APCA Lc ≥ 60 (12–14px semibold UI text).
const css = readFileSync(join(__dirname, 'globals.css'), 'utf8');

function tokens(selector: string): Record<string, string> {
  const body = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}
const light = tokens(':root');
const dark = { ...light, ...tokens('.dark') };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
/** `fg` at `alpha` over `bg`, as a solid colour (a bg-x/30 pill on a card). */
const mix = (fg: string, bg: string, alpha: number) =>
  `#${rgb(fg).map((c, i) => Math.round((alpha * c + (1 - alpha) * rgb(bg)[i]!) * 255).toString(16).padStart(2, '0')).join('')}`;
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const wcag = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** APCA 0.0.98G lightness contrast, absolute. */
const apca = (text: string, bg: string) => {
  const y = (hex: string) => {
    const [r, g, b] = rgb(hex).map((c) => c ** 2.4);
    const v = 0.2126729 * r! + 0.7151522 * g! + 0.072175 * b!;
    return v < 0.022 ? v + (0.022 - v) ** 1.414 : v;
  };
  const [yt, yb] = [y(text), y(bg)];
  const s = yb > yt ? (yb ** 0.56 - yt ** 0.57) * 1.14 : (yb ** 0.65 - yt ** 0.62) * 1.14;
  return Math.abs(Math.abs(s) < 0.1 ? 0 : (s - Math.sign(s) * 0.027) * 100);
};

const TONES = ['interview', 'move', 'wait', 'test', 'offer', 'danger'] as const;

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme contrast', (_, t) => {
  const pairs: [string, string, string][] = [
    ['text on page', t.foreground!, t.background!],
    ['muted text on card', t['muted-foreground']!, t.card!],
    ['muted text on muted', t['muted-foreground']!, t.muted!],
    ['link on card', t.link!, t.card!],
    ['brand button', t['brand-foreground']!, t.brand!],
    ['ai button', t['ai-foreground']!, t.ai!],
    ['danger on card', t.danger!, t.card!],
    ['warning on card', t.warning!, t.card!],
    ['warning on its 25% tint', t.warning!, mix(t.warning!, t.card!, 0.25)],
    ['danger on its 15% tint', t.danger!, mix(t.danger!, t.card!, 0.15)],
    ['success on its 15% tint', t.success!, mix(t.success!, t.card!, 0.15)],
    ...TONES.map((tone): [string, string, string] => [`${tone} badge`, t[`status-${tone}-text`]!, mix(t[`status-${tone}`]!, t.card!, 0.3)]),
  ];
  // Secondary text (hints, meta, placeholders) may sit a little lower on APCA (its guide allows 45+ for it);
  // everything else is held to Lc 60. WCAG 4.5 holds for all.
  const SECONDARY = new Set(['muted text on card', 'muted text on muted']);
  it.each(pairs)('%s reads', (label, fg, bg) => {
    expect(wcag(fg, bg)).toBeGreaterThanOrEqual(4.5);
    expect(apca(fg, bg)).toBeGreaterThanOrEqual(SECONDARY.has(label) ? 55 : 60);
  });
});

describe('technology and level chips', () => {
  const chips = readFileSync(join(__dirname, '../components/ui/tech-chip.tsx'), 'utf8');
  const colours = [...new Set([...chips.matchAll(/'(#[0-9a-f]{6})'/g)].map((m) => m[1]!))];
  const share = Number(light['chip-ink'] ?? css.match(/--chip-ink:\s*(\d+)%/)?.[1]) / 100;
  it.each(colours)('%s reads on white (deepened toward the ink) and as is on the dark card', (c) => {
    const onLight = mix(c, light.foreground!, share);
    expect(wcag(onLight, mix(c, light.card!, 0.08))).toBeGreaterThanOrEqual(4.5);
    expect(wcag(c, mix(c, dark.card!, 0.08))).toBeGreaterThanOrEqual(4.5);
  });
});
