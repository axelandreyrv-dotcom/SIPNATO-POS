# Design

## Theme

Dark mode by default in task-heavy sessions; light mode for consulting on mobile. Toggle persists in `localStorage`; respects `prefers-color-scheme` on first visit. Dark mode is executive (deep navy backgrounds, not black), not dramatic.

## Colors

Strategy: **Restrained** with one Committed surface — the primary sidebar and module tiles use the azul ejecutivo as structural color (~30% of the dark surface), not as a decoration layer.

### Light mode

| Role | Token | OKLCH | Hex |
|---|---|---|---|
| Background primary | `--bg-primary` | `oklch(98% 0.007 250)` | `#F1F5F9` |
| Background secondary | `--bg-secondary` | `oklch(100% 0.005 250)` | `#FFFFFF` |
| Surface (card) | `--bg-surface` | `oklch(99% 0.006 250)` | `#FAFCFF` |
| Sidebar | `--bg-sidebar` | `oklch(24% 0.055 248)` | `#1E3A5F` |
| Text primary | `--text-primary` | `oklch(15% 0.01 250)` | `#0F172A` |
| Text secondary | `--text-secondary` | `oklch(45% 0.012 250)` | `#475569` |
| Text muted | `--text-muted` | `oklch(62% 0.010 250)` | `#94A3B8` |
| Accent | `--accent` | `oklch(54% 0.22 260)` | `#2563EB` |
| Accent subtle | `--accent-subtle` | `oklch(94% 0.06 250)` | `#DBEAFE` |
| Border | `--border` | `oklch(90% 0.010 250)` | `#E2E8F0` |
| Success | `--success` | `oklch(47% 0.15 145)` | `#16A34A` |
| Error | `--error` | `oklch(52% 0.22 27)` | `#DC2626` |
| Warning | `--warning` | `oklch(60% 0.18 65)` | `#D97706` |

### Dark mode

| Role | Token | OKLCH |
|---|---|---|
| Background primary | `--bg-primary` | `oklch(10% 0.015 250)` |
| Background secondary | `--bg-secondary` | `oklch(13% 0.018 250)` |
| Surface (card) | `--bg-surface` | `oklch(16% 0.020 250)` |
| Sidebar | `--bg-sidebar` | `oklch(20% 0.040 250)` |
| Text primary | `--text-primary` | `oklch(96% 0.006 250)` |
| Text secondary | `--text-secondary` | `oklch(70% 0.010 250)` |
| Text muted | `--text-muted` | `oklch(52% 0.010 250)` |
| Accent | `--accent` | `oklch(62% 0.20 260)` |
| Accent subtle | `--accent-subtle` | `oklch(22% 0.06 250)` |
| Border | `--border` | `oklch(22% 0.018 250)` |

## Typography

- **Family:** Inter (Fontsource bundled), fallback `system-ui, sans-serif`
- **Scale (fixed rem, ratio ~1.2):**

| Step | Size | Weight | Usage |
|---|---|---|---|
| `text-xs` | 0.75rem | 400/500 | Labels, badges, captions |
| `text-sm` | 0.875rem | 400/500 | Secondary UI text, table data |
| `text-base` | 1rem | 400 | Body, form inputs |
| `text-lg` | 1.125rem | 500/600 | Section headings, modal titles |
| `text-xl` | 1.25rem | 600 | Page headings |
| `text-2xl` | 1.5rem | 700 | Dashboard totals, KPI numbers |

- Body line length capped at 65ch in prose contexts.
- No display fonts. Inter carries everything.

## Spacing

Tailwind default scale. Consistent rhythm: `gap-4` between related elements, `gap-6` between sections, `p-4` on cards, `p-6` on page containers.

## Elevation

Three layers only:
1. **Flat**: backgrounds, sidebars, toolbars — no shadow
2. **Raised**: cards, inputs on focus — `shadow-sm`
3. **Floating**: dropdowns, tooltips, toasts — `shadow-md`

No `shadow-xl`, `shadow-2xl` in product UI.

## Components

### Buttons

```
Primary:   bg-accent text-white, hover brightness-110, active brightness-95
Secondary: bg-transparent border border-border text-text-primary, hover bg-accent-subtle
Danger:    bg-error text-white, hover brightness-110
```

All buttons: `h-9 px-4 rounded-md text-sm font-medium` (compact for task UI). Touch targets padded to 44px min via `min-h-[44px]` on mobile breakpoints.

### Form inputs

`h-9 px-3 rounded-md border border-border bg-bg-secondary text-text-primary text-sm`
Focus: `border-accent ring-1 ring-accent/20`
Error: `border-error ring-1 ring-error/20`

### Module tiles (dashboard)

`aspect-square rounded-xl bg-bg-surface border border-border flex flex-col items-center justify-center gap-2 cursor-pointer`
Hover: `border-accent bg-accent-subtle transition-colors duration-150`
Icon: Lucide, 32px, `text-accent` (active) or `text-text-secondary` (inactive)

### Navigation sidebar

Width 240px desktop, collapses to icon-only 64px on `sm` breakpoint, bottom navigation sheet on mobile.

## Motion

- Duration: 150ms for state changes (hover, focus), 200ms for reveals (dropdown, toast).
- Easing: `ease-out` (cubic-bezier 0.16, 1, 0.3, 1) for reveals; `ease-in-out` for toggles.
- Module transitions: View Transitions API (see `/vercel-react-view-transitions`), 200ms crossfade.
- `prefers-reduced-motion`: all transitions disabled.
- No page-load sequences. No staggered animations on static content.

## Icons

Lucide React, stroke-width 1.5, consistent 20px in UI / 32px in module tiles. Never mix styles.

## Dark mode implementation

Tailwind `darkMode: 'class'`. Toggle writes `'dark'` class to `<html>`. CSS custom properties per theme in `app.css`. No inline conditional styles.
