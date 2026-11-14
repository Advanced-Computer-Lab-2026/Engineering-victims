# Patterns

**Scope:** reusable UI patterns — actions, cards, navigation, search/filters, forms, tables, overlays, feedback, media, and responsive behavior.
**Use with:** [foundations.md](foundations.md) · [states.md](states.md) · [content-accessibility.md](content-accessibility.md)

## Universal rules

- One primary action per view. Fewer cards, more space. One brand family.
- Every interactive element is a real `button` or `a`, with a visible focus state.
- Every pattern has loading, empty, error, and success behavior where data is involved.
- Prefer spacing, headings, and dividers over new containers.
- Cite one mature reference for a non-trivial pattern and note what you borrowed.

---

## 1. Actions and buttons

### Hierarchy

| Level | Appearance | Use |
| --- | --- | --- |
| Primary | Filled `primary` background, `on-primary` text | The one action the screen is for |
| Secondary | Outline or tonal | Supporting actions that are still important |
| Tertiary | Text/link | Low-emphasis navigation or escape |
| Destructive | `error` role, visually distinct | Delete, cancel, remove access |
| Icon-only | Square/circular button with icon | Space-constrained, familiar actions only |

Rules:

- Exactly one filled primary button in a decision context. Repeating the *same* action in a header and footer is acceptable; two *different* primaries are not.
- Button labels are verb + object: `Book this tour`, `Save changes`, `Send invite`. Not `Submit`, `Continue`, `OK` without context.
- Destructive actions are never adjacent to the primary without spacing, and require confirmation or a 5–10 second undo.
- Disabled buttons are a last resort. If the user cannot submit, explain why inline; do not leave a dead button as the only feedback.
- Loading buttons keep their label width, show an inline spinner, and prevent double submit.
- Icon-only buttons need an accessible name. Use a tooltip only when the icon is not universally understood.
- Minimum target: 44×44 px (48 preferred). The visual button may be smaller if the hit area is padded.

### Sizes

- Small: 32px height, compact toolbars and table rows.
- Medium: 40px height, default.
- Large: 48px height, primary mobile actions and onboarding.
- Full-width on mobile for the primary action of a form.

### States

`default → hover (8% state layer) → pressed (10%) → focus (ring) → disabled (38% content) → loading`.

---

## 2. Cards

A card is a container for **one self-contained subject** that a user may compare, select, or open: a tour, product, booking, person, article.

### Use a card when

- Items are peers in a collection and need scanning/comparison.
- The item has a media thumbnail, title, a few metadata points, and one action.
- Clicking the whole card opens one destination.

### Do not use a card when

- The content is a single field or a paragraph on a single-subject page.
- It is a page section that could be a heading + spacing + divider.
- It would create a card inside a card inside a card.
- The card contains more than one competing primary action.

### Anatomy

| Slot | Rule |
| --- | --- |
| Media | Fixed aspect ratio (16:9 or 4:3); real photo; `object-fit: cover`; explicit dimensions |
| Eyebrow/meta | Category, location, duration, date — 1 line, caption size |
| Title | 1–2 lines, heading or label style, truncate with a tooltip/title if needed |
| Description | 2–3 lines max; do not repeat the title |
| Key facts | Price, rating, availability, group size — tabular numbers |
| Action | One primary link/button; secondary actions in an overflow menu |

Rules:

- Consistent card heights within a row; use `align-items: stretch` and a flexible content area.
- Whole-card click only if there is one action. If there are multiple interactive elements, make the title the link and keep actions separate.
- No nested cards. Use an inner divider or spacing for sub-sections.
- Grid: 1 column mobile, 2 tablet, 3 desktop for rich cards; 4 only for compact, image-light cards.
- Card padding from `--space-16` to `--space-24`; gap from `--space-24`.
- A card may use a border or a shadow, not both. Flat cards use `--color-outline-variant` borders.

### Anti-patterns

- A card for every field on a detail page.
- A card with a gradient border, glow, and hover lift.
- A card whose entire surface is clickable *and* contains buttons.
- Ten cards of equal visual weight with no hierarchy.
- Fake data inside a “dashboard” card that is not connected to anything.

---

## 3. Navigation

### Header

- Brand mark links home.
- Primary navigation shows the current section with an active state (text weight + underline/indicator, not color alone).
- One primary action in the header at most; if the page has a different primary action, the header action is secondary.
- Sticky headers must not cover focused content; use `scroll-margin-top`.
- Mobile: a clear menu button with an accessible name, or a bottom bar for 3–5 top-level destinations.

### Sidebar

- Use for persistent, multi-section products, not for a 3-page site.
- Current item has a clear selected state; collapsed mode keeps icons + tooltips.
- Do not hide the only navigation behind a hover.

### Tabs

- Tabs switch views within the same context; they do not navigate to a different product area.
- Use `role="tablist"`, `role="tab"`, `role="tabpanel"`, arrow-key navigation.
- The active tab is visibly selected, not just colored.
- Do not use tabs for sequential steps; use a stepper.

### Breadcrumbs

- Use when the hierarchy is deeper than two levels.
- Show the current page as plain text, not a link.
- Truncate middle levels on mobile, never the current page.

### Mobile navigation

- Bottom bar: 3–5 destinations, icon + label, current state obvious.
- Drawer: full-height, focus-trapped, `Esc` closes, return focus to trigger.
- Do not put the primary action only in the drawer.

---

## 4. Search and filters

This is the pattern most likely to be overbuilt. Start with the user’s question, not the data schema.

### Toolbar

- Search input with a clear button and an example placeholder (`Search tours, cities, or hosts`).
- Visible filter controls for the 2–4 most-used filters; everything else under `All filters`.
- Result count near the toolbar: `24 tours`.
- Sort control separate from filters.
- Applied filters appear as removable chips above the results: `Date: Jun 12–18 ×`, `Price: under $900 ×`, `Clear all`.

### Behavior

- Debounce search 250–300ms; do not search on every keystroke.
- Show a loading state inside the results region, not a full-page spinner.
- Distinguish **no results** from **empty**: no results means “your filters matched nothing”; offer `Clear filters` and the active filter summary.
- Preserve filter state in the URL so back/forward and sharing work.
- On mobile, filters move into a full-height sheet or drawer with `Apply` and `Clear all`; show the active count on the trigger.
- Never remove a filter to simplify the mobile layout. Re-home it.
- Keep the result count accurate; if it is approximate, say so.

### Filter sheet anatomy

1. Title (`Filters`) + close button.
2. Active filter count.
3. Groups with clear labels (`Price`, `Date`, `Language`, `Group size`).
4. `Clear all` (text) and `Show 24 results` (primary) pinned at the bottom.
5. Focus trap, `Esc`, return focus, scroll lock.

### Anti-patterns

- A filter sidebar that collapses into an unusable horizontal scroll on mobile.
- Chips that cannot be removed.
- A “no results” screen with no way back.
- Filtering that silently drops the user’s query.
- A result count that does not update.

---

## 5. Forms

### Structure

- Group fields by meaning: `Contact`, `Trip details`, `Payment` — not a flat 12-field list.
- One column by default. Two columns only for short, paired fields (city/postal code, start/end date).
- Labels above inputs, always visible. Placeholders are examples, not labels.
- Required fields marked consistently; optional fields marked if most are required.
- Helper text before the error, not after.
- Primary action at the end of the form; secondary `Cancel` as a text/outline action.
- Long forms: step indicator with labeled steps, save draft, or a review step. Do not stuff them into a modal.

### Fields

- Use the correct `type`, `inputmode`, and `autocomplete` (`email`, `tel`, `given-name`, `cc-number`, etc.).
- Use `fieldset`/`legend` for radio/checkbox groups.
- Show examples, not filler: `e.g., Atlas Travel Services`, `e.g., 01234567`.
- Never use a placeholder as the only label.
- Password fields need show/hide, caps-lock warning, and a clear requirement list.

### Validation

- Validate on blur and on submit; do not interrupt while typing the first time.
- Field-level error below the field, linked with `aria-describedby`.
- Error copy: what is wrong + how to fix it. `Enter a date from today onward`, not `Invalid date`.
- On submit failure, move focus to the first error or an error summary at the top.
- Preserve all input values when validation fails; never clear the form.
- Do not disable the submit button as validation. Let the user submit and explain what is missing.

### Destructive forms

- Explain consequences in plain language.
- Require an explicit acknowledgment for irreversible actions.
- Offer undo where possible; confirmation for permanent deletion.
- Destructive button uses the `error` role; the safe action is the primary/outline.

---

## 6. Tables and lists

Choose by the user’s question:

- **Table** when the goal is precise comparison across columns.
- **List** when the goal is scanning items with varied content.
- **Timeline** when the goal is sequence or timing.
- **Calendar** when the goal is availability across dates.

### Tables

- Left-align text, right-align numbers, use tabular numerals.
- Sticky header for long tables; zebra striping only if it improves scanability, never both stripes and heavy borders.
- Sortable columns show direction; default sort is explicit.
- Row actions are visible without hover. Primary row action as a link/button; secondary in an overflow menu.
- Empty, loading, and error states live inside the table body, not outside it.
- Responsive: keep the most important 2–3 columns, move the rest into an expandable row or detail page. Do not horizontal-scroll a 9-column table on mobile without a clear affordance.
- Pagination shows total count, current range, and page size where relevant.

### Lists

- One clear title per row; metadata below in caption style.
- Whole-row click only if there is one action; otherwise use a title link.
- If rows are selectable, show a checkbox column and a bulk-action bar that appears only when selection exists.
- Do not use a card per row in a dense list.

### Row actions

- Hover-only actions are forbidden; they are invisible on touch and keyboard.
- Always-visible action cell or overflow menu with a clear affordance.
- Confirm destructive row actions; offer undo for reversible ones.

---

## 7. Overlays

| Pattern | Use | Avoid |
| --- | --- | --- |
| Modal/dialog | Short confirmation, focused decision, small form | Long multi-step forms, 11-field forms |
| Sheet/drawer | Filters, mobile navigation, contextual details | Primary navigation on desktop |
| Popover | Menus, date pickers, small selection | Essential information that must persist |
| Tooltip | Short clarification of an icon | Essential instructions, long text, interactive content |
| Command palette | Power-user navigation/search | Replacing all visible navigation |

Rules:

- Modal: focus trap, `Esc` closes, click scrim closes only if no unsaved input, return focus to trigger, scroll lock, `aria-modal`, labelled by title.
- Sheet: same focus rules; swipe-to-dismiss only if it does not conflict with scroll.
- Popover: close on outside click and `Esc`; do not nest popovers.
- Tooltip: appears on hover and focus, dismissible with `Esc`, not the only way to access information.
- Do not stack overlays. If a modal needs another modal, the flow is wrong.
- Long content in a modal scrolls inside the body, not the page behind it.

---

## 8. Feedback

| Level | Pattern | Use |
| --- | --- | --- |
| Field | Inline error/help text | Validation, format guidance |
| Section | Inline banner/section message | Failed fetch, permission, partial failure |
| Page | Full-page state | 404, 500, maintenance, no access |
| Global | Toast/snackbar | Low-stakes success, undo, background completion |

Rules:

- Do not use a toast for an error the user must act on; use an inline banner with a recovery action.
- Toasts: max one at a time, 4–6 seconds for success, persistent for errors with a dismiss/action, `aria-live="polite"` (assertive only for urgent).
- Banners: one per page region, with a clear title, explanation, and action.
- Avoid stacking multiple banners; consolidate.
- Progress: determinate when progress is known; indeterminate only when it is not.
- Success is quiet. Do not celebrate routine actions with confetti.

---

## 9. Media

- Use real photography from licensed sources (Unsplash, Pexels, brand library). Do not present generated images as real photos.
- Fixed aspect ratios: 16:9 hero, 4:3 card, 1:1 avatar/thumbnail. Set `width`/`height` or `aspect-ratio` to prevent layout shift.
- `object-fit: cover` for cards; `object-position` to keep the subject in frame.
- `alt` describes the content and purpose, not “image.” Decorative images use `alt=""`.
- `srcset`/`sizes` for responsive images; `loading="lazy"` below the fold; `fetchpriority="high"` for the hero.
- Provide a labeled neutral placeholder if no real image exists (`Photo coming soon`), not a fake photo.
- Do not put text over a busy photo without a contrast-tested scrim.

---

## 10. Pagination and long lists

- Prefer pagination for tables and search results; prefer “load more” for feeds; infinite scroll only when the user does not need to return to a position.
- Show total count and current range.
- Preserve scroll position and filters when returning from a detail page.
- “Load more” keeps a visible button; do not auto-load without a sentinel that is keyboard reachable.
- Empty last page is a bug; handle it.

---

## 11. Onboarding and first use

- Show the product’s value before asking for setup.
- One decision per step; skip is visible.
- Progress indicator with labeled steps for 3+ steps.
- Do not block the entire app behind a tour. Use contextual hints.
- Empty states are onboarding: explain the next action and provide a sample/template.
- Persist dismissal; do not show the same tour every visit.

---

## 12. Responsive behavior

- Adapt the layout, not just the width.
- Summary panels move above the form on mobile.
- Primary action spans the width on mobile.
- Toolbars collapse into a drawer/sheet; filters remain reachable.
- Tables reflow to key columns + expandable details.
- Navigation becomes a bottom bar or drawer with clear current state.
- Test 360, 768, 1200, 1440; no horizontal scroll at 200% zoom.
- Respect safe areas on notched devices.

---

## 13. Pattern anti-patterns

- Every section in a card; every card with a shadow and a gradient border.
- Two filled buttons side by side with equal weight.
- A filter bar that hides the applied filters.
- A table with hover-only row actions.
- A modal containing a long form.
- A toast for a destructive error.
- A 404 page that says “Something went wrong.”
- A mobile layout that is just the desktop layout squeezed.
- An empty state that says “No data.”
- A loading state that is a blank page.
