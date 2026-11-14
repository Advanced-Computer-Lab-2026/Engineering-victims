# Workflow and Review

**Scope:** how to audit, design, implement, and verify UI work.
**Use with:** [design-brief.md](design-brief.md) · [foundations.md](foundations.md) · [patterns.md](patterns.md) · [states.md](states.md) · [content-accessibility.md](content-accessibility.md)

## Universal rules

- Audit before editing. Report findings before changing files.
- One logical change set at a time, traceable to a rule.
- Two options for non-trivial screens; one reference; one decision record.
- Verify by looking at the rendered result, not by trusting the code.
- No new dependencies without approval.

---

## 1. When to use this workflow

Use it for any of the following:

- A new page, flow, or major component.
- A visual refresh or design-system change.
- A UX review of an existing screen.
- A “make it look better” request with no specifics (the most common case).
- A migration from a generic AI-generated UI to a deliberate one.

For a one-line copy fix, skip to the relevant section and the final checklist.

---

## 2. Phase 0 — Define

Before designing, fill these in:

1. Who is the user?
2. What is the one job of this screen?
3. What are the entry points and the next step?
4. What data is required, and what happens when it is missing?
5. What are the constraints (stack, brand, deadline, compliance)?
6. What are the non-goals?

If the request is vague, ask for the **six facts**: product, users, job, constraints, must-keep, success signal. Do not invent them.

Then fill the project facts and screen inventory in `PRODUCT.md` (copy [../PRODUCT.example.md](../PRODUCT.example.md)).

---

## 3. Phase 1 — Audit (read-only)

Run these searches from the repo root. Report counts and file paths before editing.

```bash
# Gradients on surfaces
grep -rnE "(linear|radial|conic)-gradient" src/ app/ components/ styles/ 2>/dev/null

# Emoji used as UI icons
grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/ --include=*.{jsx,tsx,vue,svelte,html,js} 2>/dev/null

# Inter as default
grep -rnE "font-family[^;]*Inter|['\"]Inter['\"]" src/ styles/ 2>/dev/null

# Hardcoded hex colors
grep -rnE "#[0-9a-fA-F]{3,8}\b" src/ components/ styles/ 2>/dev/null

# Hardcoded px for spacing/radius/border
grep -rnE "(margin|padding|gap|border-radius|border-width)\s*:\s*[0-9]+px" src/ 2>/dev/null

# Placeholder images
grep -rnE "(placeholder\.com|placehold|picsum|dummyimage|placekitten)" src/ 2>/dev/null

# Generic titles
grep -rn "<title>" src/ app/ pages/ 2>/dev/null

# Generic errors
grep -rniE "(something went wrong|an error occurred|invalid input|oops)" src/ 2>/dev/null

# div/span as buttons
grep -rnE "<(div|span)[^>]*onClick" src/ 2>/dev/null

# Hover-only actions
grep -rnE "(hover|group-hover).*(actions|menu|buttons)" src/ 2>/dev/null
```

Then produce a table:

| Rule | Count | Files | Severity | Fix |
| --- | --- | --- | --- | --- |
| B1 gradient surfaces | 3 | Hero.jsx, Card.tsx | P1 | Flat token fill |
| B2 emoji icons | 7 | Nav.tsx | P1 | Lucide icons |
| ... | | | | |

Also list:

- Routes/screens and which states are missing (loading, empty, error, success, 403/404/429/500/offline).
- Token gaps (values used with no token).
- Duplicated components or one-off styles.
- Any screen that is only a happy path.

### Severity

| Level | Meaning | Examples |
| --- | --- | --- |
| P0 | Blocks use or accessibility | Keyboard trap, unreadable contrast, broken checkout, no error state on payment |
| P1 | Clear quality failure | Gradient surfaces, emoji icons, hardcoded palette, missing empty state, hover-only actions |
| P2 | Inconsistency or friction | Random radii, inconsistent spacing, weak hierarchy, ambiguous labels |
| P3 | Polish | Minor alignment, copy tightening, optional motion |

Stop and ask before editing if there are **more than 20 violations** or if any fix requires a design decision (font, brand color, IA, destructive flow).

---

## 4. Phase 2 — Tokenize

1. Confirm [tokens.css](../tokens.css) is unmodified and imported after `brand.css`.
2. Create or repair `brand.css`: every `--brand-*` role, light and dark, plus `--brand-font-sans`. Use [brand.example.css](../brand.example.css) as the role list.
3. Replace hardcoded colors, spacing, radii, shadows, and durations with semantic tokens.
4. Keep the rendered result as close as possible; this phase should not redesign.
5. Add missing semantic tokens upstream before using them. Do not add one-off values.
6. Commit the brand/token layer separately from visual changes.

Checklist:

- [ ] One brand family; no unrelated accents.
- [ ] Every `--brand-*` role defined in light and dark; `check.sh` passes.
- [ ] All colors resolve to `--color-*`, not `--brand-*` or a primitive.
- [ ] All spacing resolves to `--space-*`.
- [ ] All radii resolve to `--radius-*`.
- [ ] Type sizes resolve to `--text-*`.
- [ ] Motion resolves to `--duration-*` / `--ease-*`.

---

## 5. Phase 3 — Structure and patterns

Fix the big things before the small things:

1. **Hierarchy:** one `h1`, clear sections, one primary action per view.
2. **Layout:** fewer cards, more space; no nested cards; card = one subject.
3. **Navigation:** current location obvious; mobile navigation usable; no hover-only access.
4. **Search/filters:** visible applied filters, result count, clear all, filtered-empty, URL state, mobile sheet.
5. **Forms:** grouping, labels, examples, validation, preserve input.
6. **Tables/lists:** correct view for the question; visible row actions; responsive fallback.
7. **Overlays:** modal vs page, focus trap, `Esc`, return focus.
8. **Responsive:** reflow, not squeeze; primary action spans on mobile; test 360/768/1200/1440.

---

## 6. Phase 4 — States

For every data or input screen, add the missing states from [states.md](states.md):

- Loading: <200ms none, 200ms–5s in-container, >5s progress; skeletons for structured content; button loading.
- Empty: first-use, filtered-empty, no-results, permission-empty; each with an action.
- Error: field, section, page, 403, 404, 429, 500, offline, partial, stale, session.
- Success: inline/toast/confirmation; next step.
- Destructive: confirm or undo; name the object.

A screen with only the happy path is a bug.

---

## 7. Phase 5 — Content and assets

- Replace lorem ipsum and fake data with real or clearly labeled sample content.
- Write specific labels, hints, errors, and empty copy.
- Use real photos with licenses; add `alt`, dimensions, `srcset`.
- Unique `<title>`, favicon, manifest, OG image.
- Remove generic error copy.
- Check dates, currency, numbers, and pluralization.

---

## 8. Phase 6 — Accessibility and performance

- Keyboard-only pass: every action reachable; focus visible; no traps; `Esc` closes overlays.
- Screen reader spot check: landmarks, headings, labels, errors, dialogs.
- Contrast: body 4.5:1, large/UI 3:1.
- Targets: 44×44 minimum (48 preferred).
- Zoom: 200%, no horizontal scroll; 320px reflow.
- Reduced motion: `prefers-reduced-motion` disables transforms/animations.
- Performance: LCP < 2.5s, CLS < 0.1, INP < 200ms; fonts subset/preloaded; images sized.

---

## 9. Phase 7 — Verify by looking

Run the app and inspect:

- 360, 768, 1200, 1440 px.
- Keyboard only.
- 200% zoom.
- `prefers-reduced-motion: reduce`.
- Slow 3G and offline.
- Empty data, filtered-empty, no-results.
- Error paths: 403, 404, 429, 500, offline, session expiry.
- Long content: long titles, long emails, 3-line descriptions, 100 rows.
- Dark mode, if supported.

Do not declare done from code review alone.

---

## 10. Two-option rule

For any non-trivial screen or pattern (navigation, filter bar, card grid, checkout, empty state, 404), produce two options:

| | Option A | Option B |
| --- | --- | --- |
| Layout | | |
| Primary action | | |
| Pros | | |
| Cons | | |
| Reference | | |
| Best for | | |

Then choose one and record it with [decisions-template.md](decisions-template.md). One option may be “the existing pattern, refined”; that still counts if you explain why it wins.

Do not present two options that are cosmetically different but structurally identical.

---

## 11. Reference rule

For every non-trivial pattern:

1. Find one mature reference that solves the same problem.
2. Name what you borrowed: layout, interaction, hierarchy, copy pattern.
3. Do not copy brand-specific visuals, copy, or proprietary assets.
4. Cite it in the decision record and in the PR description (not a noisy code comment).
5. If no reference exists, say so and justify the invention.

Use [references.md](references.md) for the source library. Atlassian and Material 3 are the default foundations; product references are for interaction patterns.

---

## 12. Decision log

Record decisions that a future agent would otherwise re-litigate:

- Font/color/icon changes.
- Layout choices between two credible options.
- New patterns with no direct precedent.
- Trade-offs (density vs. clarity, modal vs. page, table vs. cards).
- Any AI-generated element that was rejected or redesigned, and why.

Use [decisions-template.md](decisions-template.md). Keep it short: one page per decision.

---

## 13. Change-set hygiene

- One logical change per commit/PR: tokens, then bans, then states, then patterns, then content.
- Every change references a rule or a decision.
- Do not mix a token refactor with a redesign.
- Do not add `!important` to win a specificity fight; fix the source.
- Do not add a one-off override to satisfy a screenshot.
- Do not delete content or capability to make a screen simpler; re-home it.

---

## 14. Definition of done

### Visual system

- [ ] One brand family; no unrelated accents.
- [ ] No gradient surfaces, emoji UI, or Inter default.
- [ ] Spacing/radius/type all from tokens.
- [ ] One primary action per view; consistent hierarchy.
- [ ] Cards are subjects, not sections; no nested cards.

### States

- [ ] Loading, empty, error, success exist and are specific.
- [ ] 403/404/429/500/offline/session exist where relevant.
- [ ] 404/500 are custom; error copy is specific.
- [ ] Destructive actions have confirm/undo.

### Content and assets

- [ ] Real copy; no lorem ipsum.
- [ ] Real photos; meaningful `alt`; dimensions; responsive sources.
- [ ] Unique title, favicon, manifest, OG basics.

### Accessibility and performance

- [ ] Keyboard, focus, labels, errors, dialogs, `Esc`.
- [ ] Contrast, targets, no color-only meaning.
- [ ] Reduced motion, 200% zoom, 320px reflow.
- [ ] LCP/CLS/INP within budget.

### Process

- [ ] Audit report exists.
- [ ] Two options considered for non-trivial work.
- [ ] One reference cited per non-trivial pattern.
- [ ] Decision log updated.
- [ ] One weak AI-generated element redesigned with a reason.

---

## 15. Stop conditions

Pause and ask the user when:

- The fix requires changing the brand, font, icon set, or token system.
- The fix requires a new dependency or a third-party component.
- The flow is destructive, irreversible, billing, or permission-related.
- The product facts are ambiguous.
- The audit finds more than 20 violations.
- The only way to “simplify” is to remove a capability the user asked to keep.
- The design would need real content or assets the project does not have.

---

## 16. One-question review

> If a first-time user saw this on a phone, with a keyboard, on a slow connection, with missing data, and after a failure — would they still know where they are, what they can do, and what happens next?

If the answer is not an immediate yes, the work is not done.
