# Decision: Migrate the interface from Inter to Public Sans

**Date:** 2026-11-13
**Owner:** Project team
**Surface / route:** Global typography
**Status:** accepted

### Context

The app declares `@fontsource-variable/inter`, an Inter `@font-face`, and
`Inter` as the Tailwind sans family. `ui-system/AGENTS.md` non-negotiable 4
requires Public Sans by default and forbids defaulting to Inter. The project
chose full migration rather than a recorded exception.

### Options

| | Option A: Keep Inter with an exception | Option B: Migrate to Public Sans |
| --- | --- | --- |
| Summary | Record Inter as a legacy exception in `decisions/` | Replace the font dependency and family |
| Pros | No dependency change; zero visual risk | Meets the system default; consistent with the contract |
| Cons | Permanent deviation; every future audit flags it | One dependency swap; type metrics change slightly |
| Reference | `ui-system/docs/foundations.md` §5.1 | `ui-system/docs/foundations.md` §5.1 |
| Accessibility impact | None specific | Public Sans has a tall x-height and open forms; keep 14px body minimum |
| Implementation cost | Low | Low |

### Decision

Option B. The project migrates to Public Sans, self-hosted through
`@fontsource-variable/public-sans`, and removes the Inter dependency. The
tokenized type scale is kept; no heading is resized individually.

### What we borrowed

The default typeface and weight set (400/500/600/700) from the UI system, which
follows the Public Sans recommendation rather than the generic Inter default.

### Consequences

- The dependency list and `index.html`/`index.css` font wiring change.
- Font metrics differ slightly; layout is re-checked at 360/768/1200/1440.
- Inter is not kept as a fallback family; the system fallback stack applies
  until the WOFF2 loads.

### Follow-up

- [x] Brand font token set
- [x] Inter dependency removed
- [ ] Visual check at all four breakpoints
