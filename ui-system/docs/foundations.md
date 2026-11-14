# Foundations

**Scope:** the visual system — tokens, spacing, radius, color, typography, elevation, motion, icons, and grid.
**Use with:** [tokens.css](../tokens.css) · [design-brief.md](design-brief.md) · [patterns.md](patterns.md)
**Source of truth:** `tokens.css`. If this document and the CSS disagree, fix both together.

## Universal rules

- Every visual value is a token. No hardcoded hex, px, radius, shadow, or duration in components.
- One brand family, neutral surfaces, semantic status colors only. No unrelated saturated accents.
- No gradient surfaces. Photo scrims for legibility and documented brand marks are the only exceptions.
- Public Sans, not Inter. Icons are vectors, not emoji.
- Spacing and radius come from a fixed scale. Consistency beats per-component feel.

---

## 1. Token architecture

Use four layers. Components consume **semantic** or **component** tokens, never primitives or brand roles.

| Layer | File | Example | Who uses it |
| --- | --- | --- | --- |
| Brand | `brand.css` (project) | `--brand-primary`, `--brand-font-sans` | Never used by components |
| Primitive | `tokens.css` (system) | `--space-16`, `--radius-lg` | Theme and semantic aliases |
| Semantic | `tokens.css` (system) | `--color-primary`, `--color-surface` | Components and layouts |
| Component | local stylesheet | `--button-primary-bg`, `--card-padding` | One component family |

Rules:

- If a component needs a new value, add a semantic or component token first.
- Do not alias a brand role or primitive directly in a component (`color: var(--brand-primary)` and `color: var(--teal-40)` are both bugs). Use `--color-primary`.
- Name by **role**, not appearance: `--color-danger` is better than `--color-red`.
- The project changes brand roles in `brand.css`; it never edits `tokens.css`.
- Dark mode is brand roles remapped in `brand.css`; it never inverts primitives by hand.

---

## 2. Spacing

Base unit: **8px**, with a 4px half-step for dense UI. This is the Atlassian scale, expressed as CSS tokens.

| Token | px | rem | Typical use |
| --- | --- | --- | --- |
| `--space-0` | 0 | 0 | Reset |
| `--space-2` | 2 | 0.125 | Hairline nudges, icon-to-badge |
| `--space-4` | 4 | 0.25 | Icon-to-text, chip padding |
| `--space-6` | 6 | 0.375 | Dense cell padding |
| `--space-8` | 8 | 0.5 | Small component padding, tight stacks |
| `--space-12` | 12 | 0.75 | Button padding, form field gaps |
| `--space-16` | 16 | 1 | Default component padding, card inner gap |
| `--space-20` | 20 | 1.25 | Comfortable card padding |
| `--space-24` | 24 | 1.5 | Section inner spacing, card grid gap |
| `--space-32` | 32 | 2 | Between content groups |
| `--space-40` | 40 | 2.5 | Large section spacing |
| `--space-48` | 48 | 3 | Page section spacing |
| `--space-64` | 64 | 4 | Major section separation |
| `--space-80` | 80 | 5 | Hero / page-level breathing room |

Usage:

- **Small (0–8):** icon-to-text, badge padding, table cell padding, inner card stacks.
- **Medium (12–24):** button padding, form groups, card padding, grid gaps.
- **Large (32–80):** page sections, hero spacing, major content separation.

Rules:

- Related items use closer steps; unrelated sections use farther steps.
- Prefer `gap` and `padding` over margins for layout.
- No `5px`, `7px`, `9px`, `10px`, `11px`, `13px`, `18px`, `22px`, `28px`, `30px`, `36px`, `44px`, `56px`.
- Optical adjustments are allowed only with the same scale and a one-line comment explaining why.

---

## 3. Radius

One vocabulary, mapped by **component type**, not by feel. This mirrors Atlassian’s radius tokens.

| Token | px | Use |
| --- | --- | --- |
| `--radius-xs` | 2 | Badges, checkboxes, keyboard hints, tiny labels |
| `--radius-sm` | 4 | Tags, tooltips, timestamps, compact buttons, table images |
| `--radius-md` | 6 | Buttons, inputs, textareas, selects, nav items |
| `--radius-lg` | 8 | Cards, in-page containers, dropdown menus, popovers |
| `--radius-xl` | 12 | Modals, sheets, large tables, full-page containers |
| `--radius-2xl` | 16 | Video players, large media frames |
| `--radius-full` | 999 | Avatars, pills, circular icon buttons |

Rules:

- Map by type: controls → `md`; cards → `lg`; dialogs → `xl`; avatars → `full`.
- Do not mix `10px`, `14px`, `18px`, `24px` randomly.
- Nested radius: a child inside a padded parent may use the parent radius minus the padding, but never a larger radius than the parent.
- **Focus ring:** 2px offset, radius = element radius + 2px. The ring must sit outside the component and remain visible on every background.
- Avoid “squircle” hacks unless the brand explicitly uses them.

---

## 4. Color

### 4.1 One brand family

- Derive the palette from **one source color** using Material Theme Builder (HCT/tones), not hand-picked hex values, and write the roles into `brand.css`.
- The brand family supplies `primary`, `on-primary`, `primary-container`, and `on-primary-container`; `tokens.css` only aliases them as `--color-*`.
- Surfaces are **neutral**, tinted slightly toward the brand hue. They are not a second accent.
- `secondary` and `tertiary` are supporting, muted roles. They must not compete with `primary`.
- Status colors (`success`, `warning`, `info`, `error`) are **semantic**, not decorative. A success state may be green; a marketing section may not be green “for variety.”

**The test:** cover the screen in grayscale. The primary action and the current state should still be obvious. If the color was carrying the hierarchy, fix the hierarchy.

### 4.2 Required roles

| Role | Purpose |
| --- | --- |
| `primary` / `on-primary` | Main action, active state, key emphasis |
| `primary-container` / `on-primary-container` | Selected chips, highlighted panels, tonal emphasis |
| `secondary` / `secondary-container` | Supporting emphasis, secondary selection |
| `tertiary` / `tertiary-container` | Rare third emphasis; never a second brand |
| `surface` / `on-surface` | Page background and primary text |
| `surface-container-lowest` … `highest` | Nested surfaces, cards, sheets, menus |
| `surface-variant` / `on-surface-variant` | Secondary text, subtle fills |
| `outline` / `outline-variant` | Borders, dividers, input outlines |
| `inverse-surface` / `inverse-on-surface` | Snackbars, tooltips, inverse chips |
| `error` / `on-error` / `error-container` | Destructive actions and errors |
| `success` / `warning` / `info` (+ containers) | Status only |
| `scrim` / `shadow` | Modal scrim, elevation |

The project file defines these as `--brand-primary`, `--brand-on-primary`, and
so on. Copy the full role list from [brand.example.css](../brand.example.css);
`tokens.css` aliases them as `--color-*` for components.

### 4.3 State layers

Apply a state layer of the `on-*` color at low opacity. Do not invent new hex values for hover.

| State | Opacity |
| --- | --- |
| Hover | 8% |
| Focus | 10% |
| Pressed | 10% |
| Dragged | 16% |
| Disabled content | 38% |
| Disabled container | 12% |

Implementation: `background: color-mix(in srgb, var(--color-on-primary) 8%, transparent)` or a pseudo-element overlay. Do not stack multiple state layers.

### 4.4 Contrast

- Body text: **4.5:1** minimum.
- Large text (≥24px regular or ≥19px bold): **3:1**.
- UI components, borders, icons that carry meaning: **3:1**.
- Focus ring: **3:1** against the adjacent background.
- Never use color alone to communicate status; pair with an icon, label, or shape.
- Test both light and dark themes, and disabled states.

### 4.5 Anti-patterns

- Purple-to-blue gradient hero with white text.
- A different accent per section (“purple for AI, green for growth, orange for energy”).
- Gray text on a saturated brand fill.
- Brand color used for body text.
- More than one saturated color competing in the same viewport.
- Dark mode made by inverting hex values.

---

## 5. Typography

### 5.1 Typeface

- **Primary:** Public Sans, weights 400 / 500 / 600 / 700.
- **Mono:** system monospace for code and IDs (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`).
- **Do not** default to Inter. If a legacy project already uses Inter, do not silently swap it; record the migration as a separate decision.
- Load at most four weights. Self-host WOFF2 in production; subset Latin if the product is Latin-only.
- `font-display: swap`; preload the regular and semibold files only.

### 5.2 Scale

Use rem, not px, so browser zoom works. Sizes below are the 16px-base equivalents.

| Token | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `--text-display` | 40 / 48 | 600 | Marketing hero, rare |
| `--text-h1` | 32 / 40 | 600 | Page title |
| `--text-h2` | 24 / 32 | 600 | Section title |
| `--text-h3` | 20 / 28 | 600 | Subsection |
| `--text-body-lg` | 16 / 24 | 400 | Long-form body |
| `--text-body` | 14 / 20 | 400 | Default UI body |
| `--text-label` | 14 / 20 | 500 | Buttons, tabs, field labels |
| `--text-caption` | 12 / 16 | 400 | Helper text, metadata |
| `--text-code` | 13 / 20 | 400 | Code, IDs, timestamps |

Rules:

- One `<h1>` per page; heading levels descend in order.
- Body text never below 14px for essential content; 12px only for captions and metadata.
- Line length: 45–75 characters for long-form; cap with `max-width: 65ch`.
- Use `font-variant-numeric: tabular-nums` for tables, prices, timers, and aligned metrics.
- Do not use all-caps for long labels; letter-spacing only for short eyebrow labels.
- Do not center long paragraphs.
- No more than three weights in one view.

---

## 6. Elevation and borders

- Elevation communicates **z-axis**, not importance. If a surface does not sit above another, it gets no shadow.
- Levels: `0` flat, `1` raised card/header, `2` dropdown/popover, `3` modal/sheet.
- Prefer a border (`--color-outline-variant`) over a shadow for flat cards.
- Shadows are soft, low-opacity, and never colored.
- Do not use “glow” shadows, colored shadows, or shadows on every card.

```css
--shadow-1: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08);
--shadow-2: 0 4px 8px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.10);
--shadow-3: 0 12px 32px rgb(0 0 0 / 0.16);
```

Borders: `--border-width` (1px) default; `--border-width-strong` (2px) for focus or selected states. Never use 3px+ unless it is a deliberate, documented brand treatment.

---

## 7. Motion

Motion must have a job: entry, press feedback, state transition, reorder, or reveal.

| Token | Value | Use |
| --- | --- | --- |
| `--duration-fast` | 150ms | Hover, press, small fades |
| `--duration-base` | 250ms | Expand/collapse, dropdowns, toasts |
| `--duration-slow` | 350ms | Page/section transitions |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default |
| `--ease-decelerate` | `cubic-bezier(0, 0, 0, 1)` | Entering |
| `--ease-accelerate` | `cubic-bezier(0.3, 0, 1, 1)` | Exiting |

Rules:

- Animate `opacity` and `transform`; avoid animating layout properties (`width`, `height`, `top`, `left`) unless the layout change is the point.
- Do not animate on route change if it delays content. A 150ms fade is enough.
- Stagger list items by 20–30ms, maximum 6 items; do not stagger long lists.
- Skeleton shimmer is optional; disable it under `prefers-reduced-motion`.
- Every animation respects `prefers-reduced-motion: reduce`; the state change still happens instantly.
- No infinite loops, idle bobbing, parallax, or looping glow.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 8. Iconography

- **Default set:** Lucide. One family, one stroke width (2px), one optical size grid (24px).
- Sizes: `--icon-sm` 16 (inline), `--icon-md` 20 (compact controls), `--icon-lg` 24 (default), `--icon-xl` 32 (feature/empty state). Stroke: `--icon-stroke` (2).
- Icons inherit `currentColor`; never hardcode icon colors.
- Icon-only buttons need an accessible name (`aria-label` or visually hidden text) and a tooltip if the meaning is not universal.
- Decorative icons use `aria-hidden="true"`; meaningful icons need a text label or `alt`.
- Do not use emoji as UI icons. Emoji are allowed only in user-generated content.
- Do not mix filled, outline, and duotone styles in the same interface.
- Pair unfamiliar icons with labels. A magnifier is universal; a “sparkle” is not “AI settings.”

---

## 9. Grid and breakpoints

| Breakpoint | Width | Layout |
| --- | --- | --- |
| `sm` | 360 | 1 column, 16px gutter |
| `md` | 768 | 4 columns, 24px gutter |
| `lg` | 1024 | 8 columns, 24px gutter |
| `xl` | 1200 | 12 columns, 32px gutter |
| `2xl` | 1440 | 12 columns, max content 1280 |

Rules:

- Mobile-first. Start at 360, enhance upward.
- Max content width: 1200–1280 for reading; full-bleed only for media or deliberate hero.
- Gutters: `--page-gutter` is 16 mobile, 24 tablet, 32 desktop.
- Do not use `100vw` for full-bleed sections; it causes horizontal scroll with scrollbars. Use `width: 100%`.
- Test at 200% zoom; no horizontal scroll.
- Prefer CSS Grid for page layout and Flexbox for one-dimensional groups.
- Do not hide essential content at small sizes; reflow or move it into a drawer/sheet.

---

## 10. Using the tokens

1. Import `brand.css` first, then [tokens.css](../tokens.css), at the app root:

   ```css
   @import "./brand.css";
   @import "./ui-system/tokens.css";
   ```

2. `tokens.css` maps every color to a `--brand-*` role with a fallback, so the
   system renders even before a brand file exists.
3. Set `data-theme="dark"` on `<html>` for a manual dark theme, or rely on
   `prefers-color-scheme`. The brand file must define both.
4. Use semantic tokens in components. Add component tokens only when a component needs a stable alias.
5. Never write a raw value in a component. If the token does not exist, it is a
   system change: add it to `tokens.css` upstream, not in the project.
6. When the brand changes, replace the source color and regenerate the palette
   into `brand.css`; do not hand-edit individual roles and do not touch `tokens.css`.

---

## 11. Foundation anti-patterns

- A gradient button with a glow shadow.
- Four corner radii on one screen.
- `10px`, `18px`, `22px`, `30px` spacing values.
- Two saturated accent colors in one viewport.
- Inter loaded “because it is safe.”
- Emoji in the navigation.
- A card with a shadow, a border, and a gradient.
- Dark mode made by `filter: invert(1)`.
- A focus ring that disappears on the brand background.
- Motion that loops forever.
