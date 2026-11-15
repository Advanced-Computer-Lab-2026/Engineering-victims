# UI/UX Documentation

This folder is a portable, self-contained UI/UX system for humans and AI agents.
It is written so any document can be handed to an agent on its own, without the
original workshop deck.

**Core idea:** the best practices are frozen; the brand and product facts are
project files. A new project changes `brand.css` and `PRODUCT.md` — never the
system.

## Start here

1. **[../AGENTS.md](../AGENTS.md)** — the short, always-read contract.
2. **[using-the-system.md](using-the-system.md)** — install, brand swap, font
   swap, update, verify.
3. **[PRODUCT.example.md](../PRODUCT.example.md)** — copy to `PRODUCT.md` and
   fill the product facts.
4. **[design-brief.md](design-brief.md)** — the full universal brief.

## Package map

| File | Owner | What it covers |
| --- | --- | --- |
| [../AGENTS.md](../AGENTS.md) | system | Always-read contract: defaults, overrides, 12 non-negotiables |
| [../VERSION.md](../VERSION.md) | system | Version, changelog, breaking changes |
| [../tokens.css](../tokens.css) | system | Structural tokens and `--brand-*` aliases |
| [../brand.example.css](../brand.example.css) | project template | Palette + font; copy to `brand.css` |
| [../PRODUCT.example.md](../PRODUCT.example.md) | project template | Facts, journey, screen inventory; copy to `PRODUCT.md` |
| [../check.sh](../check.sh) | system | Install check and anti-pattern audit |
| [design-brief.md](design-brief.md) | system | Direction, principles, journey method, screen method, DoD |
| [foundations.md](foundations.md) | system | Token layers, spacing, radius, color, type, motion, icons, grid |
| [patterns.md](patterns.md) | system | Actions, cards, navigation, search, forms, tables, overlays |
| [states.md](states.md) | system | Loading, empty, error, success, offline, permission, session |
| [content-accessibility.md](content-accessibility.md) | system | Voice, microcopy, formats, images, metadata, WCAG, performance |
| [workflow-and-review.md](workflow-and-review.md) | system | Audit, build order, severity, decisions, definition of done |
| [using-the-system.md](using-the-system.md) | system | Install, brand/font change, update, troubleshooting |
| [references.md](references.md) | system | Source map, deck map, Atlassian/M3/Public Sans links |
| [impeccable.md](impeccable.md) | system | Claude Impeccable skill and how it fits |
| [decisions-template.md](decisions-template.md) | system | Copy-paste decision record |
| [examples/travel.md](examples/travel.md) | example | Filled product file and journey |
| [../decisions/](../decisions/README.md) | project | Project-specific decisions |

## How to use this with an agent

**Short session / small change:** give the agent `AGENTS.md`.
**New project:** `AGENTS.md` + `using-the-system.md` + `PRODUCT.md` + `brand.css`.
**New feature or screen:** `design-brief.md` + `foundations.md` + `patterns.md` + `states.md`.
**Visual audit:** `foundations.md` + `../tokens.css` + `workflow-and-review.md`.
**Copy or asset pass:** `content-accessibility.md`.
**Tooling:** `impeccable.md`.

Every deep-dive repeats the universal non-negotiables in a short box at the top,
so it still works if the agent never opens `AGENTS.md`.

## Maintenance

- `../tokens.css` is the source of truth for structural values.
- `brand.css` is the source of truth for color and font. The sample palette in
  `brand.example.css` is a working default, not a brand.
- If a doc and the CSS disagree, fix both together.
- Do not add a rule that cannot be checked. Prefer a grep, a test, or a
  concrete example.
- Keep the always-read contract under ~120 lines. Move detail into the deep
  dives.
- Never edit a vendored system file in a project. Record an exception in
  `decisions/`, or propose the change upstream.
- The original `agents-ui.md` is a pointer to this system; do not add rules
  there.

## Provenance

The rules come from:

- The **ACL UI/UX Visual Workshop** deck (34 slides, six concepts and review
  examples). The deck is not required to use these docs; its lessons are
  inlined and mapped in [references.md](references.md).
- **Atlassian Design System — Foundations**: 8px spacing base, radius tokens,
  typography scale, tokens over raw values, accessibility.
- **Material 3**: color roles and tonal palettes, shape scale, typescale, state
  layers, motion, 48dp touch targets.
- **Public Sans** as the default typeface.
- The **Impeccable** design skill by Paul Bakaus, which informed the review
  workflow and the anti-slop checks.

Licenses and links are listed in [references.md](references.md).
