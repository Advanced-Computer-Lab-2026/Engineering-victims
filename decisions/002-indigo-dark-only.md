# Decision: Indigo brand family, dark-only release, no gradient surfaces

**Date:** 2026-11-13
**Owner:** Project team
**Surface / route:** Global theme
**Status:** accepted

### Context

The app rendered an indigo/slate interface on a fixed slate-to-black gradient
and used five accent families (indigo, sky, emerald, amber, rose) partly as
decoration. The system requires one brand family, neutral tinted surfaces,
semantic status colors only, and no gradient surfaces. The project wants to
keep indigo and keep the current dark appearance for this release.

### Options

| | Option A: Keep the gradient and multi-accent look | Option B: Flat indigo, dark-only, semantic status colors |
| --- | --- | --- |
| Summary | Preserve the current visual styling | One indigo family on flat surfaces; status colors only for status |
| Pros | No visual movement | Meets non-negotiables 1, 2, 4; simpler hierarchy |
| Cons | Fails three non-negotiables; decorative color carries meaning | One-time visual change; light theme deferred |
| Reference | — | Material 3 color roles; `ui-system/docs/foundations.md` §4 |
| Accessibility impact | Gradient reduces predictable contrast; color-only accents | Flat surfaces make contrast measurable; status always paired with text/icon |
| Implementation cost | Low | Medium |

### Decision

Option B. Indigo `#4F46E5` is the single source color and is written into
`brand.css` as the full Material 3 role set. Filled actions and accent text
use a tone from the same indigo family rather than the 600 tone verbatim:
in the dark scheme `--brand-primary` is indigo 300 (`#A5B4FC`) with a deep
indigo `--brand-on-primary`, because a 600-tone fill cannot carry readable
dark text and is too dark to read on a dark surface. The page gradient and the
card sheen gradient are removed in favour of flat surfaces. The app forces
`data-theme="dark"`; `brand.css` still defines every light role so the file is
complete and `check.sh` passes. A light theme or toggle is explicitly out of
scope.

### What we borrowed

Material 3 role naming and tonal mapping from the UI system and Material Theme
Builder. We did not copy a third-party product's palette.

### Consequences

- One indigo family drives actions; sky/emerald/amber/rose are status roles
  only (info/success/warning/error).
- Dashboard accent-per-item decoration is removed.
- Revisit if the institution supplies an official brand palette or asks for a
  light theme.
