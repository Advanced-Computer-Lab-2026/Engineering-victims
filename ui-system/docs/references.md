# References

**Scope:** where the rules come from, what to cite, and how to use references without copying blindly.
**Rule:** every non-trivial pattern needs one cited reference and one sentence explaining what you borrowed.

---

## 1. How to use a reference

1. **Name the problem** the reference solves (filtering, empty state, 404, checkout).
2. **Borrow the structure**, not the skin: hierarchy, interaction, layout, copy pattern.
3. **Do not copy** brand-specific visuals, illustrations, copy, or proprietary assets.
4. **Adapt** to this system’s tokens, Public Sans, and one-brand-family rule.
5. **Cite** the source in the decision record and PR description.

A reference is evidence, not decoration. “It looks like Linear” is not a reason; “Linear’s command menu keeps the input focused and groups results by type” is.

---

## 2. Source map — workshop deck

The ACL UI/UX Visual Workshop deck is the origin of several rules. It is **not required** to use this system; the lessons are inlined. This map is for provenance and for agents reviewing the original material.

| Deck topic | Slide | What it teaches | Where it lives here |
| --- | --- | --- | --- |
| Framing | 1–4 | Why default AI UI looks generic | [design-brief.md](design-brief.md) §2 |
| Design the user journey | 5 | Map stages, questions, pain points before screens | [design-brief.md](design-brief.md) §4 · [PRODUCT.example.md](../PRODUCT.example.md) §3 |
| Journey examples | 6–8 | Flow and screen inventory | [examples/travel.md](examples/travel.md) · [PRODUCT.example.md](../PRODUCT.example.md) §4 |
| Cards: when they help, when they do not | 9 | Card = one subject; fewer cards, more space | [patterns.md](patterns.md) §2 |
| Card examples | 10–13 | Anatomy, hierarchy, comparison | [patterns.md](patterns.md) §2 |
| Use design tokens, not random values | 14 | Tokens over hex/px; consistency | [foundations.md](foundations.md) |
| Make the main action clear | 15 | One primary action per view | [patterns.md](patterns.md) §1 |
| Build a theme from one color | 16 | Material Theme Builder; tonal palette | [foundations.md](foundations.md) §4 |
| Theme examples | 17–20 | Light/dark roles, contrast | [foundations.md](foundations.md) §4 |
| Rome tour cards | 21 | Real photos, card metadata, comparison | [patterns.md](patterns.md) §2 |
| Review examples | 22–27 | Common layout and hierarchy mistakes | [workflow-and-review.md](workflow-and-review.md) |
| Design beyond the happy path | 28 | Loading, empty, error, success | [states.md](states.md) |
| Show schedules in the right view | 29 | List vs timeline vs calendar | [patterns.md](patterns.md) §6 |
| Schedule example | 30 | View choice by user question | [patterns.md](patterns.md) §6 |
| A clearer design brief | 31 | Product, users, job, constraints, must-keeps, non-goals | [PRODUCT.example.md](../PRODUCT.example.md) |
| Brief example | 32 | Filters, two layouts, pros/cons | [workflow-and-review.md](workflow-and-review.md) §10 |
| Plan. Choose. Build. Test. | 33 | Explore → choose → build → verify | [workflow-and-review.md](workflow-and-review.md) |
| Closing | 34 | Defensible decisions | [design-brief.md](design-brief.md) §12 |

---

## 3. Foundation references

### Atlassian Design System

| Topic | Link | What to borrow |
| --- | --- | --- |
| Foundations | https://atlassian.design/foundations | The overall token-first approach |
| Spacing | https://atlassian.design/foundations/spacing | 8px base; scale from 0–80; proximity and rhythm |
| Radius | https://atlassian.design/foundations/radius | Token names and component mapping; focus ring = radius + 2px |
| Typography | https://atlassian.design/foundations/typography | Heading/body/metric/code roles; rem units |
| Color | https://atlassian.design/foundations/color | Semantic roles; contrast |
| Motion | https://atlassian.design/foundations/motion | Functional motion; durations |
| Iconography | https://atlassian.design/foundations/iconography | One icon family; optical sizes |
| Accessibility | https://atlassian.design/foundations/accessibility | Practical a11y guidance |
| Content | https://atlassian.design/foundations/content | Clear, concise product language |
| Elevation | https://atlassian.design/foundations/elevation | Elevation as z-axis |

### Material 3

| Topic | Link | What to borrow |
| --- | --- | --- |
| Color roles | https://m3.material.io/styles/color/roles | Role names and semantic mapping |
| Color system | https://m3.material.io/styles/color/system/overview | Tonal palettes from a source color |
| Material Theme Builder | https://material-foundation.github.io/material-theme-builder/ | Generate light/dark tonal roles from one source color |
| Shape | https://m3.material.io/styles/shape/corner-radius-scale | Shape scale: 0/4/8/12/16/28/full |
| Typescale | https://m3.material.io/styles/typography/type-scale-tokens | Display/headline/title/body/label roles |
| State layers | https://m3.material.io/foundations/interaction/states/overview | Hover/focus/pressed/dragged opacity |
| Motion | https://m3.material.io/styles/motion/overview | Duration and easing families |
| Accessibility | https://m3.material.io/foundations/accessible-design/overview | 48dp targets, contrast, semantics |

> M3’s site is a JavaScript app; if a page fails to load in an agent’s fetcher, use the published token names in [foundations.md](foundations.md) and cite the canonical URL.

### Public Sans

| Topic | Link | What to borrow |
| --- | --- | --- |
| Google Fonts | https://fonts.google.com/specimen/Public+Sans | Weights, specimen, language support |
| Source | https://github.com/uswds/public-sans | License, files, design notes |
| License | SIL Open Font License 1.1 | Free for product use; keep the license |

### Type and accessibility

| Topic | Link | What to borrow |
| --- | --- | --- |
| WCAG 2.2 quick reference | https://www.w3.org/WAI/WCAG22/quickref/ | The actual success criteria |
| WebAIM contrast checker | https://webaim.org/resources/contrastchecker/ | Verify pairs |
| Inclusive Components | https://inclusive-components.design/ | Pattern-level a11y |
| GOV.UK Design System | https://design-system.service.gov.uk/ | Error summaries, one thing per page, plain language |
| Nielsen heuristics | https://www.nngroup.com/articles/ten-usability-heuristics/ | UX review vocabulary |

---

## 4. Pattern references

Use these for interaction structure; adapt to the project’s tokens and brand.

| Pattern | Reference | What to borrow |
| --- | --- | --- |
| Empty states | Shopify Polaris — empty states | Explanation + primary action + optional illustration |
| Error summaries | GOV.UK Design System — error summary | Focus the summary, link each error to its field |
| Data tables | IBM Carbon — data table | Sticky header, sorting, row actions, responsive fallback |
| Forms | Atlassian Design System — form | Grouping, labels, inline validation, helper text |
| Filtering | Airbnb / Booking.com search results | Visible applied filters, chips, clear all, result count, mobile sheet |
| Card grids | Airbnb / Material 3 cards | Consistent anatomy, real photos, one action |
| Command menu | Linear / Raycast | Keyboard-first search, grouped results, recent items |
| 404 pages | GitHub 404 | Plain explanation, search, home, no dead end |
| Checkout | Stripe Checkout | Short form, inline validation, clear confirmation |
| Timelines | Material 3 / Atlassian timeline patterns | Sequence, grouping, current state |
| Toasts | Material 3 snackbar | One at a time, action, `aria-live` |
| Onboarding | Linear / Notion onboarding | Value first, one decision per step, skippable |

**Do not** browse for “inspiration” and copy a whole page. Pick the smallest reference that solves the specific problem.

---

## 5. Impeccable

| Topic | Link |
| --- | --- |
| Product site | https://impeccable.style/ |
| Repository | https://github.com/pbakaus/impeccable |
| Docs | https://impeccable.style/docs |
| Detector | https://impeccable.style/docs/detector |
| Context files | https://impeccable.style/docs/context |

See [impeccable.md](impeccable.md) for what it does and how it fits this system. Impeccable is a process and review tool; this brief is the project law.

---

## 6. Licensing and attribution

- **Public Sans:** SIL Open Font License 1.1. Keep the license file with the font.
- **Lucide:** ISC License. Keep the license notice.
- **Impeccable:** Apache 2.0; it started from Anthropic’s `frontend-design` skill.
- **Atlassian and Material 3:** use their guidance as reference; do not copy proprietary assets, illustrations, or brand marks.
- **Photos:** record the source and license for every image. Unsplash/Pexels licenses are not a substitute for model/property releases when the image implies endorsement.
- **Workshop deck:** internal training material; do not redistribute the deck. The rules in this system are rewritten and self-contained.

---

## 7. Reference checklist

- [ ] The reference solves the same user problem, not just a similar-looking page.
- [ ] I can name what I borrowed in one sentence.
- [ ] I did not copy brand-specific visuals or copy.
- [ ] The result uses this system’s tokens, type, and color rules.
- [ ] The decision is recorded in [decisions-template.md](decisions-template.md).
- [ ] The reference is cited in the PR description.
