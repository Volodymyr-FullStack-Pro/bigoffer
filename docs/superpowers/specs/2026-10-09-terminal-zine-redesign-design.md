# Terminal Zine redesign — design

Date: 2026-10-09 · Status: approved direction (owner: "делай как предлагаешь")

## Goal

Replace the light-first "Neo-brutal Job Zine" look with a dark-first **Terminal Zine** style inspired by
syntax.fm: near-black surfaces, a warm yellow accent, monospace metadata, hairline borders and grit texture.
It must feel distinctive (not a generic SaaS template) and stay fast on the daily screens (feed, board).

Non-goals: new features, layout/IA changes, a marketing landing page, new routes.

## Approach

The UI is already token-driven: colors come from CSS variables in `apps/web/src/app/globals.css`, surfaces
use the `.brutal` / `.brutal-press` component classes (99 / 53 uses in 33 files). So the redesign is:

1. **Retune tokens** (dark + light) in `globals.css`.
2. **Redefine the surface classes** in place — keep the class names `.brutal` / `.brutal-press` so the 33
   files do not churn; only their look changes.
3. **Restyle a handful of signature components** where the new style needs more than tokens.
4. **Make dark the default theme** (`defaultTheme="dark"` in `providers.tsx`); the toggle and light theme stay.

## Tokens

Dark (default):

| Token | Value | Note |
|---|---|---|
| `--background` | `#131516` | syntax.fm black |
| `--card` | `#1b1d1f` | raised surface |
| `--muted` | `#24272a` | hover / subtle fill |
| `--foreground` | `#f2f0e9` | warm off-white |
| `--muted-foreground` | `#9a9da1` | ≥ 4.5:1 on `--background` |
| `--border` | `#2e3236` | hairline |
| `--border-strong` | `#f2f0e9` | focus / selected / emphasis |
| `--brand` | `#ffcb05` | warm yellow accent |
| `--brand-foreground` | `#131516` | text on yellow |
| `--ai` | `#a78bfa` | violet, lighter for dark contrast |
| `--success` | `#4ade80` | |
| `--danger` | `#f87171` | |
| `--warning` | `#fb923c` | orange — distinct from the yellow brand |
| `--radius` | `5px` | |
| `--noise-opacity` | `0.07` | grit stays |

Light: same roles, cream base kept (`--background #f4f1e8`, `--card #fffdf7`, `--foreground #131516`,
`--border #d9d4c5`, `--border-strong #131516`), brand `#ffcb05` with dark text, semantic colors darkened
for AA on cream (`--success #15803d`, `--danger #b91c1c`, `--warning #c2410c`, `--ai #6d28d9`).

New tokens are exposed through `@theme inline` (`--color-border-strong`).

## Typography

- Display (h1–h3): **Unbounded** stays, tighter tracking (`-0.02em`).
- Body: **Onest** stays.
- **JetBrains Mono** becomes the "terminal" voice: buttons, badges, nav labels, scores, dates, counters,
  table headers — uppercase-free, `font-mono text-[13px]` with slight tracking.

## Surfaces

- `.brutal`: `1.5px solid var(--border)`, radius 5px, `bg-card`, **no hard offset shadow**. On hover of
  interactive surfaces the border goes to `--border-strong`.
- `.brutal-press`: press = `translateY(1px)` + border to `--border-strong` (no shadow travel).
- Focus: 2px `--brand` outline with 2px offset everywhere (`:focus-visible`).
- Grit: the existing SVG noise overlay is kept.

## Signature components

1. **Button** (`components/ui/button.tsx`): mono label; `brand` = yellow fill, dark text, hover slightly
   brighter; `outline` = hairline, hover border-strong; `ghost` unchanged in shape.
2. **ScoreMeter**: big mono number (`text-lg font-bold`) + 10 thin segments; ≥80 brand yellow,
   ≥60 warning orange, else muted.
3. **SourceBadge** (new, `components/ui/source-badge.tsx`): small mono pill with a per-source color
   (DOU, Djinni, robota.ua, ITLead, Telegram, LinkedIn, Greenhouse, Lever, Ashby, Workable, remote boards…)
   — the syntax.fm "Tasty / Hasty" tag idea. Colors live in a UI-only map; unknown sources fall back to muted.
4. **Feed list item** (`today/feed-list-item.tsx`): "episode row" — score number on the left, title
   (display font), company + source badge + relative time in mono on one line; selected row gets a yellow
   left bar instead of a tinted background.
5. **Shell** (header, sidebar, bottom nav): mono nav labels, active item = yellow left bar / underline,
   logo wordmark `BIGOFFER` in Unbounded with a yellow dot.
6. **Login page**: dark hero — big Unbounded headline, mono sub-line, yellow CTA; one subtle React Bits
   text effect (respecting `prefers-reduced-motion`).

Everything else inherits the look through tokens and `.brutal`.

## Motion

Short (80–150 ms) border/color transitions only; no layout animation on daily screens. The existing
`prefers-reduced-motion` kill-switch stays.

## Testing

- Unit tests and typecheck stay green; e2e selectors (`data-testid`) are untouched.
- Contrast: check text tokens against their surfaces (AA ≥ 4.5:1 for body text) with a small script.
- Visual check: run the app locally and screenshot `/login`, `/today`, `/board`, `/profile`, `/search`
  in dark and light at desktop and 390 px widths.

## Rollout

One PR `feat/redesign-terminal-zine` into `develop`; owner reviews screenshots on the Vercel preview and
merges. Easy rollback: the change is mostly `globals.css` + a few components.
