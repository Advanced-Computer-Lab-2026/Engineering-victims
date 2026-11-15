# UI/UX Design Brief

**Version:** 2.1.0
**Status:** authoritative for design direction and method. Product facts live in `PRODUCT.md`.
**Audience:** designers, engineers, and AI agents.
**Companion contract:** [../AGENTS.md](../AGENTS.md)
**Install:** [using-the-system.md](using-the-system.md)
**Deep dives:** [foundations](foundations.md) · [patterns](patterns.md) · [states](states.md) · [content & accessibility](content-accessibility.md) · [workflow](workflow-and-review.md) · [references](references.md)

---

## How to use this brief

Read this once per project, then keep it open while designing. It defines **what
“good” means** and **how to build it**. What we are building, for whom, and the
product journey live in `PRODUCT.md`.

If a product fact is unknown, ask. Do not invent it in the brief or in the UI.

---

## 1. Project facts live in PRODUCT.md

This brief is **universal**. It deliberately contains no product facts, so the
same brief can be reused without editing the system.

Fill the project file instead:

- **`PRODUCT.md`** (copy `PRODUCT.example.md`) — product, users, primary job,
  constraints, direction words, journey, screen inventory, non-goals.
- **`brand.css`** (copy `brand.example.css`) — palette and typeface.
- **`decisions/`** — exceptions and trade-offs.

See a complete filled example: [examples/travel.md](examples/travel.md).

### Universal defaults

| Field | Default | Where to override |
| --- | --- | --- |
| Typeface | **Public Sans** 400 / 500 / 600 / 700 | `brand.css` → `--brand-font-sans` |
| Icon set | **Lucide**, 24px grid, 2px stroke | decision record + project AGENTS pointer |
| Color | One brand family + neutral surfaces + semantic status roles | `brand.css` |
| Token source | [../tokens.css](../tokens.css) | system change only |
| Breakpoints | 360 / 480 / 640 / 768 / 1024 / 1200 / 1440 | fixed |
| Target browsers | last 2 versions of Chrome, Safari, Firefox, Edge | project file |

**Rule:** a project may override the typeface, icon set, or palette **only** in
`brand.css` (or the icon decision) and only with a recorded decision. The rest
of this brief still applies.

### Design direction

Record the product's three direction words in `PRODUCT.md`. The universal
direction — clear, calm, credible — is defined in §2 and applies unless the
project records a deliberate exception.

---

## 2. Design direction

### The three words

- **Clear.** The next step is obvious. One primary action. Labels say what happens. No clever ambiguity.
- **Calm.** Whitespace, restrained color, few containers. The interface recedes; the content leads.
- **Credible.** Real photos, real copy, precise states, honest errors. Nothing looks like a template.

### The anti-direction

Reject these unless the brand explicitly owns them:

- Purple-to-blue gradients, glassmorphism, glowing blobs, “AI startup” palettes.
- Emoji as interface chrome.
- Card soup: every field, filter, and paragraph in its own rounded box.
- Fake dashboards, fake charts, fake testimonials, fake logos.
- Generated “photos” presented as real photography.
- Decorative animation: floating, pulsing, looping, parallax for its own sake.
- A different corner radius, shadow, and accent color per component.

### Reference direction

Use references as evidence, not decoration. For this brief the primary references are:

- **Atlassian Design System** — spacing, radius, typography, tokens, accessibility.
- **Material 3** — color roles, shape scale, typescale, state layers, motion.
- **Public Sans** — the default typeface.
- A small set of mature product patterns for the screen you are building (see [references.md](references.md)).

Every non-trivial pattern needs at least one cited reference and one sentence explaining what you borrowed.

---

## 3. Principles

1. **The user’s next step is the design.** If a screen does not make the next action obvious, it is not finished.
2. **Content before containers.** Use spacing, headings, and dividers before adding a card, panel, or border.
3. **One brand family, earned.** Neutral surfaces. Status colors only for status. A few related tones are fine; unrelated saturated accents are not. If everything is colored, nothing is important.
4. **Consistency beats novelty.** Reuse the token scale, the radius scale, the button hierarchy, and the same empty/error patterns everywhere.
5. **Design the state, not just the screen.** Loading, empty, error, success, offline, and permission states are part of the screen.
6. **Real over generated.** Real content, real photography, real data shapes. Placeholders must be labeled as placeholders.
7. **Motion must have a job.** Entry, press feedback, state transition, reorder, reveal. Nothing loops for decoration.
8. **Accessible by default.** Keyboard, screen reader, contrast, focus, targets, zoom, and reduced motion are not a later phase.
9. **Reference, then decide.** Two credible options beat one guess. Record the trade-off.
10. **Defensible over decorative.** Every visual decision should have a reason you can say out loud.

---

## 4. Journey before screens

Before designing pages, map the user’s journey. Each stage needs a goal, the user’s questions, the actions available, the failure points, and the screen that answers them.

### Template

| Stage | User goal | Questions | Actions | Pain points | Opportunity | Screen |
| --- | --- | --- | --- | --- | --- | --- |
| _[stage]_ | _[goal]_ | _[what they ask]_ | _[what they do]_ | _[what goes wrong]_ | _[where we can help]_ | _[route]_ |

### Worked example

A filled journey, screen inventory, and decision set for a travel product lives
in [examples/travel.md](examples/travel.md). Use it as a shape, not as content.
The project's own journey belongs in `PRODUCT.md`.

**Rule:** every screen must answer three questions in its first viewport:

1. Where am I?
2. What can I do here?
3. What happens next?

---

## 5. Screen inventory

Track every route before styling it. A screen is not “done” until its states are named.

| Route | User job | Primary action | Data | Auth | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _[path]_ | _[job]_ | _[one action]_ | _[what is fetched]_ | _[yes/no]_ | _[pattern]_ | _[pattern]_ | _[pattern]_ | _[pattern]_ |

If a route has no empty or error state, it is not finished. See [states.md](states.md).

---

## 6. Foundations summary

The full contract is in [foundations.md](foundations.md) and [tokens.css](../tokens.css). The short version:

- **Spacing:** 8px base, scale `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`. Related things close, unrelated things far.
- **Radius:** `2, 4, 6, 8, 12, 16, 999`, mapped by component type. Focus ring: 2px offset, radius +2.
- **Color:** one brand family from one source color; neutral surfaces; semantic success/warning/info/error; 4.5:1 body text, 3:1 large text and meaningful graphics.
- **Type:** Public Sans; fixed roles from display to caption; rem units; no ad-hoc sizes; no Inter default.
- **Elevation:** only to communicate z-axis. If it does not sit above something, it gets no shadow.
- **Motion:** 150–350ms for UI transitions; functional only; `prefers-reduced-motion` respected.
- **Icons:** Lucide, 16/20/24, one stroke width, accessible names on icon-only controls.
- **Grid:** mobile-first; 4/8/12 columns; max content width 1200–1280; gutters 16/24/32; test at 360/768/1200/1440.

---

## 7. Patterns summary

The full contract is in [patterns.md](patterns.md). The short version:

- **Actions:** one filled primary per view; outline/text secondary; destructive is error + confirm/undo; labels are verb + object.
- **Cards:** one subject per card; consistent anatomy; no nested cards; no card for a single field; fewer cards, more space.
- **Navigation:** current location is obvious; mobile uses a clear drawer or bottom bar; no hover-only access.
- **Search and filters:** visible applied filters as chips, result count, clear all, filtered-empty state, URL state, mobile drawer.
- **Forms:** group by meaning; labels above inputs; examples, not filler; validate at the field; preserve input on error; never disable submit as validation.
- **Tables and lists:** choose by the user’s question; sticky headers for long tables; visible row actions; responsive fallback.
- **Overlays:** modal for short confirmation, page for long forms; focus trap, `Esc`, return focus, scroll lock.
- **Feedback:** inline for field errors, banner for section errors, toast for low-stakes success; `aria-live` where needed.

---

## 8. State summary

The full contract is in [states.md](states.md). Every data or input screen needs:

- **Loading:** no indicator under 200ms; in-container indicator 200ms–5s; progress beyond 5s; skeletons for structured data; button loading state.
- **Empty:** why it is empty + the next action. Distinguish first-use, filtered-empty, no-results, and permission-empty.
- **Error:** field, section, page, 403, 404, 429, 500, offline, partial failure, stale data, session expiry.
- **Success:** inline or toast for low stakes; confirmation for destructive/irreversible actions.
- **Copy:** what happened + what it means + what to do next. No “Something went wrong.”

A blank region is not an empty state. A spinner is not a loading design. A generic error page is not an error design.

---

## 9. Content, assets, accessibility, performance

Full contract: [content-accessibility.md](content-accessibility.md).

- **Voice:** plain, specific, calm. Sentence case. No jargon, no exclamation marks, no blame.
- **Buttons:** verb + object (`Save changes`, `Book this tour`), not `Submit` or `Continue` without context.
- **Images:** real photography from licensed sources; meaningful `alt`; explicit dimensions; `srcset`; lazy loading below the fold.
- **Metadata:** unique `<title>` per route, product favicon, Open Graph basics, `theme-color`.
- **Accessibility:** WCAG 2.2 AA; semantic HTML; visible focus; keyboard; labels; errors linked; 44×44 targets (48 preferred); reduced motion; 200% zoom.
- **Performance:** LCP < 2.5s, CLS < 0.1, INP < 200ms; self-host/subset Public Sans; no layout shift from images or fonts.

---

## 10. Delivery workflow

Full workflow: [workflow-and-review.md](workflow-and-review.md).

1. **Define** — fill `PRODUCT.md` (facts, journey, screen inventory) and `brand.css`.
2. **Audit** — run the greps and `check.sh`, list violations and missing states.
3. **Tokenize** — repair brand roles and replace raw values with tokens before visual changes.
4. **Structure** — fix layout, hierarchy, cards, actions, responsiveness.
5. **States** — add loading, empty, error, success, offline, permission.
6. **Content and assets** — copy, photos, titles, favicons.
7. **Accessibility and performance** — keyboard, screen reader, contrast, zoom, budget.
8. **Verify** — 360/768/1200/1440, slow network, reduced motion, empty/error paths.

For non-trivial screens: propose two options, cite one reference each, list pros/cons, choose one, and log it with [decisions-template.md](decisions-template.md).

---

## 11. Definition of done

- [ ] `PRODUCT.md` is filled: facts, journey, screen inventory.
- [ ] `brand.css` defines every role in light and dark; `check.sh` passes.
- [ ] Journey stages and screen questions are answered.
- [ ] No gradient surfaces, emoji UI, Inter default, or hardcoded values.
- [ ] One brand family; one primary action per view; consistent radius and spacing.
- [ ] Cards represent subjects, not sections; no nested cards.
- [ ] Loading, empty, error, success states exist and are specific.
- [ ] 403/404/429/500/offline/session states exist where relevant.
- [ ] Real photography, real copy, meaningful `alt`, unique titles, favicon.
- [ ] Keyboard, screen reader, focus, contrast, targets, reduced motion, 200% zoom pass.
- [ ] Checked at 360/768/1200/1440 and on a slow connection.
- [ ] Two options considered; reference cited; decision logged.
- [ ] One weak AI-generated element was redesigned, with the reason recorded.

---

## 12. One-sentence test

> A first-time user can tell where they are, what they can do, and what happens next — on a phone, with a keyboard, on a slow connection, when the data is missing, and when something fails.
