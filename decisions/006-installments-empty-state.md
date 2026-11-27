# Decision: Astronaut Loader in the Installments Empty State

**Date:** 2026-11-27
**Owner:** Project team
**Surface / route:** `/billing` — "My installments" (student view)
**Status:** accepted

### Context

The installments screen has three outcomes: staff without a selected student,
a student with no plan assigned, and a list of installments. Only the second
is "nothing to pay", and it was a single line of grey text. The brief asks for
the Uiverse.io astronaut loader (JkHuger, MIT) there, with punchy copy
underneath. The source ships generic class names (`.body`, `.head`, `.arm`,
`.leg`, `.panel`) and a full-page 1500 × 700 starfield, neither of which can
be dropped into this project unchanged.

### Options

| | Option A: Empty list, student view only | Option B: Empty list + fully paid |
| --- | --- | --- |
| Summary | Render the loader when a student has no installments at all; staff keep their prompt | Also render it above the list when every installment's amount due is 0 |
| Pros | Nothing is hidden; the state it replaces was already a dead-end line | Reaches the "everything is paid" moment too |
| Cons | A student who has paid everything off never sees it | Sits on top of payment history, so the loudest state on the screen is the one with the least to say; two triggers to keep in sync |
| Reference | Existing `EmptyState` component — one subject, explanation, no dead ends | — |
| Accessibility impact | Illustration is `aria-hidden`; the two lines carry the meaning | Would push real history further down the page |
| Implementation cost | Low | Medium |

### Decision

Option A. `InstallmentsEmptyState` renders for a student whose installment
list is empty. Staff keep the plain prompts — for them an empty list means
"choose a student first", not "nothing to pay", and the student's own view
never shows an astronaut at a coordinator.

### What we borrowed

- **Uiverse.io, "new-deer-97" by JkHuger (MIT)** — the astronaut, the
  four-box starfield, and both keyframes, credited at the top of both files.
- **This repo's `EmptyState`** — dashed container, `text-body` headline,
  `text-caption` explanation, centred, so the new state reads as a sibling of
  every other empty state rather than a decorative one-off.

### Consequences

- **Scoping.** Every selector is renamed to `astro-*`; keyframes become
  `astro-snow` / `astro-tumble`. Nothing in the source's names survives.
- **Adaptation.** Star coordinates become percentages of the source's
  1500 × 700 canvas, the fall distance becomes the field height, and the
  figure scales through `--astro-scale` — layout only. Drawing, colours,
  5s timing and easing are untouched.
- **Artwork palette.** The illustration's ~30 hex values and its three
  hard-stop two-tone fills (`linear-gradient`) are the artwork, not UI
  colour. `check.sh` therefore gains two warnings — "hardcoded hex values"
  and "gradient declarations" — that are expected and accepted here; no UI
  surface, button, card or text uses them. UI colours around the loader stay
  on tokens (`border-outline-variant`, `bg-surface-container-low`,
  `text-on-surface`, `text-on-surface-variant`).
- **Reduced motion.** The global rule stops both animations after one
  0.01ms iteration, leaving a static astronaut and a static starfield.
- **Print.** `@media print` hides nothing here; the loader is `aria-hidden`
  and decorative, and the page's print styles already strip cards.

### Follow-up

- [x] Class names scoped, credit comment at the top of both files
- [x] Staff prompts unchanged; only the student view gains the loader
- [x] Reduced motion leaves a static figure, not a frozen spinner
- [ ] Visual check at 360/768/1200/1440 and at 200% zoom
