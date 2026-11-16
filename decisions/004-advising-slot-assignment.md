# Decision: Inline Slot Assignment in the Advising Draft

**Date:** 2026-11-16  
**Owner:** Project team  
**Surface / route:** `/advising-schedules/:studentId/draft`  
**Status:** accepted

### Context

Advisors and Coordinators need to assign, change, and remove lecture, tutorial,
and lab groups while checking remaining seats and timetable conflicts. The
existing draft editor already groups selected courses, credit hours, and save
actions in one place. The project requires mobile reflow, token-based styling,
and visible validation states.

### Options

| | Option A: Inline component groups | Option B: Per-course wizard |
| --- | --- | --- |
| Summary | Show each course's required components and slot controls beneath it | Open a separate sequential flow for each course |
| Pros | Compare the whole schedule and its conflicts in one view; fewer navigation steps | Less information per screen; simpler focus for a single course |
| Cons | The editor grows vertically for schedules with many courses | Harder to compare clashes across courses; repeated navigation to assign many slots |
| Reference | Existing Course Slot Availability page; Atlassian form grouping | GOV.UK one-thing-per-page form pattern |
| Accessibility impact | Labeled selects and actions remain in document order and keyboard reachable | Clear focus per step, but requires reliable progress and back navigation |
| Implementation cost | Low; extends the existing draft page | Medium; adds navigation state and a multi-step interaction |

### Decision

Choose Option A. The schedule's constraints are relational: a slot that fits
one course may clash with another. Keeping all selected courses and their
components together makes comparison possible without repeatedly changing
context. The accepted trade-off is a longer page, addressed with responsive
wrapping and section headings.

### What we borrowed

The existing Course Slot Availability page groups slots by component and shows
capacity. Atlassian's form guidance supports grouping related controls under
clear headings. The implementation uses those structures with the project's
semantic tokens and does not copy external visual styling.

### Consequences

- Slot assignments, clashes, remaining capacity, and validation are visible in
  one draft context.
- The page is longer when a student has many courses; mobile layout and zoom
  need explicit verification.
- No separate slot-assignment route or dependency is added.

### Follow-up

- [x] Existing tokens reused
- [x] Loading, empty, error, and success states retained or added
- [x] Responsive widths and 200% zoom checked
- [x] Keyboard focus checked
- [x] Slot conflict regression test added