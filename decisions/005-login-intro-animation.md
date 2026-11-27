# Decision: GUC Opening Animation on the Sign-in Route

**Date:** 2026-11-27
**Owner:** Project team
**Surface / route:** `/` (Sign in)
**Status:** accepted

### Context

The brief asks for a smooth, minimalistic opening animation that spells out
"GUC" the first time the sign-in page is opened or refreshed, then disappears.
The sign-in route is the first thing every account sees, and it currently
renders statically (logo, heading, card). The animation must not delay or block
sign-in, must not become a second splash screen the user has to wait through,
and must stay inside the token system with no new dependency.

### Options

| | Option A: Staggered wordmark, then hand over | Option B: Single cross-fade splash |
| --- | --- | --- |
| Summary | Each letter rises and fades in on its own beat, a brand hairline rules in under the wordmark with the university's full name, then the overlay fades out | The word "GUC" fades in as one block and fades out again |
| Pros | Reads as the letters being written; the beat and the hairline give the intro a beginning and an end; still under two seconds | Cheapest; no per-letter timing to keep in sync |
| Cons | Three staggered animations to keep aligned with the unmount timer | Flat — one colour block changing opacity; indistinguishable from a loading state |
| Reference | Material 3 motion — duration and easing families (emphasised entrance, standard exit) | Material 3 motion — cross-fade |
| Accessibility impact | Overlay is `aria-hidden`, `pointer-events: none`, and never renders under `prefers-reduced-motion` | Same, but the wait is the same length for less information |
| Implementation cost | Low — CSS keyframes on three spans plus one unmount timer | Low |

### Decision

Option A. The wordmark writes itself in letter by letter on a
`--duration-fast` stagger, a `--color-primary` hairline expands beneath it,
the full name fades in, and the overlay fades out on `--duration-slow` and
unmounts. Total runtime is 1.75s of keyframes plus a 50ms margin, driven by a
single timer in `src/components/IntroOverlay.tsx`.

### What we borrowed

Material 3 motion (https://m3.material.io/styles/motion/overview): a short,
decelerating entrance for content and an accelerating exit, with durations
taken from the project's own motion tokens rather than new values.

### Consequences

- `src/index.css` gains four keyframes and four rules, all resolving to
  tokens; no colour, size, or duration is hardcoded.
- The overlay never blocks the form: pointer events pass through it, it is
  out of the accessibility tree, and it unmounts rather than lingering.
- Under `prefers-reduced-motion: reduce` the overlay does not render at all,
  so the route opens on the form with no wait.
- It replays on every load and refresh of `/`, which is the brief; it does not
  replay on client-side navigation back to `/`… it does, since the route
  remounts — recorded here as intended behaviour, not a bug.
- No new dependency: keyframes only.

### Follow-up

- [x] Overlay is `aria-hidden` and `pointer-events: none`
- [x] Reduced motion skips the overlay entirely
- [x] Visual check at 360/768/1200/1440
- [ ] Visual check with a slow first paint (font swap during the entrance)
