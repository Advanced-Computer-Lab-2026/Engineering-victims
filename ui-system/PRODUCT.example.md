# PRODUCT.md — PROJECT FILE (copy from PRODUCT.example.md)

**Status:** project-owned and editable. The system core never reads product facts.
**System contract:** [`AGENTS.md`](AGENTS.md) · [`docs/design-brief.md`](docs/design-brief.md)
**Filled example:** [`docs/examples/travel.md`](docs/examples/travel.md)

Copy this file to `PRODUCT.md` at the project root and replace the bracketed
fields. Do not invent product facts; if a field is unknown, ask.

The universal brief defines **what good looks like**. This file defines **what
we are building and for whom**. Keep them separate so the system can be reused
without rewriting the brief.

---

## 1. Project facts

| Field | Value |
| --- | --- |
| Product | _[name + one sentence]_ |
| Primary users | _[who, in plain language]_ |
| Primary job | _[the one thing they must accomplish]_ |
| Secondary jobs | _[2–4 supporting jobs]_ |
| Success signal | _[observable outcome, not a vibe]_ |
| Constraints | _[deadline, legacy, compliance, offline, budget]_ |
| Stack | _[framework, CSS approach, component library]_ |
| Brand file | `brand.css` |
| Token source | [`tokens.css`](tokens.css) |
| Typeface | Public Sans (or the value in `brand.css`) |
| Icon set | Lucide (24px grid, 2px stroke) |
| Brand source color | _[one hex; derive the palette in Material Theme Builder]_ |
| Breakpoints | 360 / 480 / 640 / 768 / 1024 / 1200 / 1440 |
| Target browsers | _[last 2 versions of Chrome, Safari, Firefox, Edge]_ |
| Non-goals | _[what this release will not do]_ |

**Override rule:** the typeface, icon set, and palette may change **only** in
`brand.css` and only with a recorded decision. Everything else in the system
still applies. See [`docs/using-the-system.md`](docs/using-the-system.md).

---

## 2. Design direction

Three words for this product, and one sentence on what they mean here.

- **_[Word 1]:** _[what it means for this product]_
- **_[Word 2]:** _[what it means for this product]_
- **_[Word 3]:** _[what it means for this product]_

**Brand owns:** _[gradients? illustration? photography? nothing?]_
**Brand rejects:** _[what would look off-brand, beyond the universal anti-direction]_

The universal anti-direction still applies: no gradient surfaces, emoji UI,
card soup, fake dashboards, or generated photos passed off as real.

---

## 3. Journey

Map the journey before designing screens. One row per stage.

| Stage | User goal | Questions | Actions | Pain points | Opportunity | Screen |
| --- | --- | --- | --- | --- | --- | --- |
| _[stage]_ | _[goal]_ | _[what they ask]_ | _[what they do]_ | _[what goes wrong]_ | _[where we can help]_ | _[route]_ |

**Rule:** every screen answers three questions in its first viewport:

1. Where am I?
2. What can I do here?
3. What happens next?

---

## 4. Screen inventory

A screen is not done until its states are named. Use the state vocabulary from
[`docs/states.md`](docs/states.md).

| Route | User job | Primary action | Data | Auth | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _[path]_ | _[job]_ | _[one action]_ | _[what is fetched]_ | _[yes/no]_ | _[pattern]_ | _[pattern]_ | _[pattern]_ | _[pattern]_ |

If a route has no empty or error state, it is not finished.

---

## 5. Constraints and non-goals

| Type | Item | Consequence |
| --- | --- | --- |
| Constraint | _[e.g., payments provider]_ | _[what it forces in the UI]_ |
| Constraint | _[e.g., offline field work]_ | _[what it forces in the UI]_ |
| Non-goal | _[e.g., social feed]_ | _[what not to build]_ |

---

## 6. Open questions

- _[Question that blocks a design decision; who can answer it]_
- _[Unknown product fact]_

Resolve these before inventing an answer in the UI.

---

## Filled example

For a complete product file — facts, journey, screen inventory, and the
decisions it produced — see [`docs/examples/travel.md`](docs/examples/travel.md).
It is illustrative only; do not copy its facts into a real project.
