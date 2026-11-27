# Decision 008: Emerald Academic Palette & Light Default

**Date:** 2024-01-XX  
**Status:** Accepted  
**Context:** UI refresh  

## Problem

The current indigo (#4F46E5) palette feels generic "tech startup" rather than academic institution. Dark-only mode reduces readability in classrooms and lecture halls during daylight hours.

## Decision

1. **Replace indigo with emerald/teal** (#059669 as source) - traditional academic green, associated with learning institutions
2. **Light mode as default** - academic contexts need daylight readability
3. **Keep dark mode available** - still useful for evening/late-night work

## Rationale

- Emerald green has academic heritage (graduation robes, educational branding)
- Light backgrounds are standard for university portals (Canvas, Blackboard, Banner)
- Students and faculty work during daytime in bright classrooms
- Dark mode remains for personal preference via system settings

## Alternatives Considered

- **GUC official colors** - not documented in repo, would need institutional approval
- **Keep indigo, add light mode** - doesn't address generic SaaS appearance
- **Navy/burgundy** - too corporate/financial

## Consequences

- More distinctive academic identity
- Better daylight readability
- May require contrast adjustments for status colors
- Students can still use dark mode via OS preference
