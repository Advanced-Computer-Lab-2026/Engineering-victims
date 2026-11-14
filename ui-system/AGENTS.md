# AGENTS.md — UI/UX Contract

**Status:** authoritative and always-on. Read this before touching any UI file.
**Version:** 2.1.0 — see [VERSION.md](VERSION.md)
**Full brief:** [docs/design-brief.md](docs/design-brief.md)
**Index:** [docs/README.md](docs/README.md)
**Install / update:** [docs/using-the-system.md](docs/using-the-system.md)

When this file and a deep-dive doc disagree, the deeper doc wins only where it is more specific; otherwise this file wins. When code and this contract disagree, change the code — not the contract.

## Scope

Applies to every UI surface: `src/`, `app/`, `pages/`, `components/`, `styles/`, and any HTML/CSS/JSX/TSX/Vue/Svelte template.

Non-goals: backend logic, API contracts, data models, test infrastructure.

## Defaults and project overrides

This package is portable: the rules are frozen, the skin is project-owned.

| Concern | Default | Project file |
| --- | --- | --- |
| Palette | Sample teal fallbacks in [tokens.css](tokens.css) | `brand.css` (copy [brand.example.css](brand.example.css)) |
| Typeface | Public Sans 400/500/600/700 | `brand.css` → `--brand-font-sans` |
| Icons | Lucide, 24px grid, 2px stroke | decision record + project AGENTS pointer |
| Product facts, journey, screens | none — must be filled | `PRODUCT.md` (copy [PRODUCT.example.md](PRODUCT.example.md)) |
| Exceptions and trade-offs | none | `decisions/` (use [docs/decisions-template.md](docs/decisions-template.md)) |

- Treat `tokens.css`, `docs/**`, and this file as **read-only** in a project.
- Changing brand color or font is a `brand.css` edit, not a core edit.
- Changing spacing, radius, type scale, motion, or a mandatory rule is a system
  change: propose it upstream, never fork it locally.
- Render check: `./ui-system/check.sh` (or `./check.sh` in this repo).

## Operating rules

1. **Audit before editing.** Run the audit in [docs/workflow-and-review.md](docs/workflow-and-review.md). Report violations before changing files.
2. **Token-only edits.** Every color, space, radius, type size, shadow, and duration resolves to a token in [tokens.css](tokens.css). If a token is missing, add it to the system first; project-specific values go in `brand.css`.
3. **No new UI dependencies without asking.** Fonts, icon sets, component libraries, and animation libraries count as dependencies.
4. **No unrequested pages or features.** This brief improves what exists; it does not expand scope. Missing states (empty, error, 404) are allowed as minimal additions.
5. **Reference-led.** For every non-trivial pattern, find one mature reference, cite it, and say what you borrowed. Use [docs/references.md](docs/references.md).
6. **Two options for non-trivial screens.** Propose two layouts or interaction models with pros and cons before implementing one. Record the decision with [docs/decisions-template.md](docs/decisions-template.md).
7. **Verify by looking.** Check 360, 768, 1200, and 1440 px; keyboard-only; 200% zoom; `prefers-reduced-motion: reduce`; slow network; empty and error states.
8. **Stop and ask** when a change affects brand, typography, color, destructive behavior, or a public contract.

## The 12 non-negotiables

1. **One brand family.** One source color drives the interface. Neutral surfaces. Semantic status colors only. No unrelated saturated accents, no rainbow palettes, no "one purple, one pink, one cyan" decoration.
2. **Kill gradient surfaces.** No gradient buttons, cards, hero backgrounds, or text. Photo scrims for legibility and documented brand marks are the only exceptions.
3. **Icons are vectors, not emoji.** One icon family (Lucide by default), one stroke width. Emoji never appear as navigation, actions, headers, or bullets.
4. **Public Sans by default, not Inter.** Use Public Sans (400/500/600/700) with the tokenized scale, unless `brand.css` records a deliberate font override. Never default to Inter.
5. **Spacing comes from the scale.** `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80` px. No random `10px`, `18px`, `22px`, `30px`.
6. **One radius vocabulary.** `2, 4, 6, 8, 12, 16, 999` px, mapped by component type — not chosen per component by feel.
7. **One primary action per view.** Exactly one filled button in a decision context. Secondary actions are outline or text. Destructive actions use the error role and require confirmation or undo.
8. **Fewer cards, more space.** A card wraps one self-contained subject. Do not wrap every field, filter, or section in its own card. Never nest cards more than one level.
9. **No happy-path-only screens.** Every data or input screen has loading, empty, error, and success states. Add 403, 404, 429, 500, offline, and session-expiry where relevant.
10. **Real content.** Real photos from licensed sources, real copy, real data shapes. No lorem ipsum, no generated placeholder art passed off as photography, no fake dashboards.
11. **Accessibility is a floor.** Semantic HTML, visible focus, keyboard support, labels, `alt` text, 44×44 px targets (48 preferred), 4.5:1 body contrast, `prefers-reduced-motion`, 200% zoom without horizontal scroll.
12. **Finish the metadata.** Unique `<title>` per route, product favicon, Open Graph basics, custom 404 and 500 pages, and specific error copy — never "Something went wrong."

## Where to go

| Need | Read |
| --- | --- |
| Install, brand swap, font swap, update, verify | [docs/using-the-system.md](docs/using-the-system.md) |
| Full design brief | [docs/design-brief.md](docs/design-brief.md) |
| Product facts, journey, screen inventory | `PRODUCT.md` (template: [PRODUCT.example.md](PRODUCT.example.md)) |
| Spacing, radius, color, type, motion, icons, grid | [docs/foundations.md](docs/foundations.md) |
| Buttons, cards, forms, tables, navigation, overlays | [docs/patterns.md](docs/patterns.md) |
| Loading, empty, error, success, offline | [docs/states.md](docs/states.md) |
| Copy, images, titles, favicons, accessibility, performance | [docs/content-accessibility.md](docs/content-accessibility.md) |
| Audit, build order, decision log, definition of done | [docs/workflow-and-review.md](docs/workflow-and-review.md) |
| Sources, deck map, reference library | [docs/references.md](docs/references.md) |
| Claude Impeccable skill | [docs/impeccable.md](docs/impeccable.md) |
| Copy-paste decision record | [docs/decisions-template.md](docs/decisions-template.md) |
| Version and changelog | [VERSION.md](VERSION.md) |

## Stop and ask

- Changing the brand color, font, or icon set without a recorded decision.
- Editing `tokens.css`, `docs/**`, or this contract in a project — that is a
  system change, not a project change.
- Adding a dependency, font file, or third-party component.
- A destructive, irreversible, billing, or permission flow.
- Ambiguous product facts (who the user is, what the primary job is).
- More than 20 audit violations, or any change that requires a design decision rather than a fix.
- Deleting content or capability to "simplify" a screen.

## Short definition of done

- [ ] `brand.css` fills every light and dark role; `check.sh` reports no errors.
- [ ] No gradient surfaces, emoji UI, Inter default, hardcoded colors/spacing/radii.
- [ ] One brand family; one primary action; cards used for subjects, not sections.
- [ ] Loading, empty, error, success states exist and are specific.
- [ ] 404 and 500 are custom; error copy says what happened, what it means, what to do next.
- [ ] Keyboard, screen reader, focus, contrast, targets, reduced motion, 200% zoom pass.
- [ ] Unique title, favicon, real images, real copy.
- [ ] Two options considered; one reference cited; one decision logged.
- [ ] Checked at 360 / 768 / 1200 / 1440 and on a slow connection.
