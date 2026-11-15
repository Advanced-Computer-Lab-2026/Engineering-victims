# Decision Record

> Copy this file for each non-trivial decision. Keep it short. The goal is not bureaucracy; it is to stop the next agent from re-litigating a settled choice.

---

## Decision: _[short name]_

**Date:** _[YYYY-MM-DD]_
**Owner:** _[name]_
**Surface / route:** _[screen or component]_
**Status:** proposed | accepted | superseded

### Context

What problem are we solving? Who is the user, and what is the job? What constraints apply (brand, stack, accessibility, deadline)? Link the relevant brief section.

### Options

| | Option A | Option B |
| --- | --- | --- |
| Summary | | |
| Layout / interaction | | |
| Pros | | |
| Cons | | |
| Reference | | |
| Accessibility impact | | |
| Implementation cost | | |

### Decision

Which option, and why. One paragraph. Name the trade-off you accepted.

### What we borrowed

What pattern, structure, or interaction came from the reference? What did we deliberately not copy?

### Consequences

- What becomes easier?
- What becomes harder?
- What are we explicitly not doing?
- What would make us revisit this?

### Follow-up

- [ ] Tokens updated
- [ ] States covered
- [ ] Accessibility checked
- [ ] Tests/screens captured
- [ ] Docs updated

---

## Example (filled)

### Decision: Filters on mobile use a full-height sheet

**Date:** 2026-11-13
**Owner:** Design
**Surface:** Search results
**Status:** accepted

**Context:** Users need name, price, date, language, and group-size filters. The desktop sidebar is unusable at 360px; the current mobile layout hides filters behind a horizontal scroll. The brief requires all filters to remain reachable.

**Options:**

| | A. Horizontal chip scroller | B. Full-height filter sheet |
| --- | --- | --- |
| Summary | All filters in a scrolling row above results | `Filters` button opens a sheet with grouped controls |
| Pros | Always visible; fast for one filter | Room for all filters; clear apply/clear; familiar mobile pattern |
| Cons | Hidden filters off-screen; hard to see active state; poor touch targets | One extra tap; needs focus trap and scroll lock |
| Reference | — | Airbnb mobile filters |
| Accessibility | Poor: off-screen controls, small targets | Good: 44px controls, focus trap, `Esc` |
| Cost | Low | Medium |

**Decision:** Option B. The sheet keeps every filter reachable, shows the active count on the trigger, and provides `Clear all` and `Show 24 results` at the bottom. The extra tap is outweighed by discoverability and touch accuracy.

**What we borrowed:** Grouped filter sections, a pinned apply button, and an active-filter count from Airbnb’s mobile filter sheet. We did not copy its visual styling.

**Consequences:** One more component to build and test; the results page needs a visible applied-filter chip row so users can remove filters without reopening the sheet. Revisit if analytics show the sheet is opened rarely and users mostly use one filter.

**Follow-up:** tokens updated; sheet focus trap tested; empty-filtered state added; screenshot at 360 and 768.
