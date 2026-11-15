# Worked Example — Travel Booking

**Type:** illustrative product file, not a template to copy verbatim.
**Use with:** [`../../PRODUCT.example.md`](../../PRODUCT.example.md) · [`../design-brief.md`](../design-brief.md) · [`../patterns.md`](../patterns.md) · [`../states.md`](../states.md)
**System:** [`../../AGENTS.md`](../../AGENTS.md)

This example shows what a filled `PRODUCT.md` looks like and how the universal
rules apply to a real screen set. The product, users, and numbers are invented
for illustration. Replace them; do not treat them as defaults.

---

## 1. Project facts

| Field | Value |
| --- | --- |
| Product | Wanderly — a curated small-group tour marketplace |
| Primary users | Travelers planning a 3–10 day trip, often on mobile |
| Primary job | Find a tour that fits dates, budget, language, and group size, then book with confidence |
| Secondary jobs | Compare inclusions, check the cancellation policy, manage an existing booking |
| Success signal | Search → detail → checkout completion; fewer “what is included?” support contacts |
| Constraints | Real availability, payments, multi-currency, mobile-first, WCAG 2.2 AA |
| Stack | Next.js + CSS modules, tokens from `tokens.css` |
| Brand file | `brand.css` (sample teal, replaced per project) |
| Typeface | Public Sans 400/500/600/700 |
| Icon set | Lucide, 24px grid, 2px stroke |
| Breakpoints | 360 / 768 / 1200 / 1440 |
| Non-goals | Social feed, AI itinerary generator, host messaging in v1 |

**Direction words:** clear, calm, credible.

**Brand owns:** photography-led discovery. **Brand rejects:** illustration-led
empty states, gradient overlays, and account-first onboarding.

---

## 2. Journey

| Stage | User goal | Questions | Actions | Pain points | Opportunity | Screen |
| --- | --- | --- | --- | --- | --- | --- |
| Discover | Find a trip worth considering | “Where can I go? What fits my dates?” | Browse, search, filter | Too many options; unclear availability | Strong photos, honest metadata, useful filters | Search / home |
| Compare | Choose between realistic options | “What is included? What is the real price?” | Compare cards, open details | Hidden fees; vague inclusions | Price breakdown, inclusions, cancellation policy | Results / detail |
| Book | Commit with confidence | “Is my spot confirmed? What happens next?” | Pick date, group size, pay | Form fatigue; unclear errors; payment anxiety | Short form, inline validation, clear confirmation | Checkout |
| Prepare | Know what to expect | “Where do I meet? What should I bring?” | Read itinerary, contact host | Scattered info | One itinerary page, add to calendar | Booking detail |
| Travel | Get help in the moment | “Something changed — who do I contact?” | Contact support, reschedule | Hard to find help | Persistent support entry, clear status | Support / booking |
| Share | Recommend or review | “Was this worth it?” | Review, share, rebook | Friction after the trip | Lightweight review, rebook shortcut | Review |

Every screen answers: where am I, what can I do here, what happens next.

---

## 3. Screen inventory

| Route | User job | Primary action | Data | Auth | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Start a search | Search tours | Featured tours | No | Hero static; cards skeleton | n/a | Inline banner | n/a |
| `/tours` | Find candidates | Open a tour | Tour list + facets | No | Card skeletons | Filtered-empty + clear | Banner + retry | n/a |
| `/tours/[slug]` | Decide | Check availability | Tour detail, dates, price | No | Section skeletons | n/a | Section error + retry | n/a |
| `/checkout` | Book | Pay and confirm | Availability, price, payment | Yes | Button loading | n/a | Field + payment error | Confirmation page |
| `/bookings` | Manage trips | Open a booking | Booking list | Yes | Row skeletons | First-use + explore | Banner + retry | n/a |
| `/bookings/[id]` | Prepare | Add to calendar | Itinerary, meeting point | Yes | Section skeletons | n/a | Section error | Toast |
| `/support` | Get help | Contact support | FAQ, contact form | Optional | Inline | No results + browse | Field + section error | Toast |

Global pages: 403, 404, 429, 500, offline, maintenance.

---

## 4. Decisions this example produced

### 4.1 Mobile filters use a full-height sheet

| | A. Horizontal chip scroller | B. Full-height filter sheet |
| --- | --- | --- |
| Summary | All filters in a scrolling row above results | `Filters` opens a sheet with grouped controls |
| Pros | Always visible; fast for one filter | Room for all filters; clear apply/clear; familiar |
| Cons | Hidden filters; weak active state; small targets | One extra tap; needs focus trap and scroll lock |
| Reference | — | Airbnb mobile filters |
| Accessibility | Poor: off-screen controls | Good: 44px controls, focus trap, `Esc` |

**Decision:** B. Every filter stays reachable, the trigger shows the active
count, and `Clear all` / `Show 24 results` sit at the bottom. Added a visible
applied-filter chip row so users can remove a filter without reopening the sheet.

See [`../decisions-template.md`](../decisions-template.md) for the full record.

### 4.2 Results use cards; booking history uses a list

Cards let users compare tours (photo, title, price, duration, rating). Booking
history is a scannable list with one title per row and a status badge. Using
cards for both would double the vertical space and hide the status.

### 4.3 Checkout is a page, not a modal

Three steps with payment do not belong in a modal: it hides context, breaks
back-button expectations, and makes error recovery harder. The booking summary
moves above the form on mobile.

---

## 5. What this example demonstrates

- Product facts live in a project file, not in the universal brief.
- The journey is mapped before screens.
- Every route names its loading, empty, and error states.
- Non-trivial choices use two options, a reference, and a recorded decision.
- Brand is limited to palette, font, and photography direction.

Use it as a shape, not as content.
