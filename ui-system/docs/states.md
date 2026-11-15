# States

**Scope:** loading, empty, error, success, offline, permission, session, and partial-failure states.
**Rule:** a screen that fetches data or accepts input is incomplete until every relevant state exists.
**Use with:** [patterns.md](patterns.md) · [content-accessibility.md](content-accessibility.md)

## Universal rules

- No happy-path-only screens. A blank region is not an empty state; a spinner is not a loading design; a generic error page is not an error design.
- Every state answers three questions: **what happened, what does it mean for me, what can I do next?**
- States live **inside the region they replace**, not as a full-page overlay, unless the whole page is unavailable.
- Never lose the user’s input, filters, scroll position, or draft when a request fails.
- State changes are announced to assistive technology where appropriate (`aria-live`, `role="status"`, `role="alert"`).

---

## 1. State matrix

Fill this in for every data or input screen.

| Surface | Loading | Empty | Error | Success | Offline | Permission | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| List / results | skeleton rows | explain + next action | inline banner + retry | list | cached + banner | 403 panel | |
| Detail | skeleton | not-found page | section error + retry | content | cached + banner | 403 | |
| Form | submit button loading | n/a | field + summary | toast/inline | preserve draft | 403 | |
| Dashboard | card skeletons | first-use guidance | per-widget error | data | stale badge | 403 | |
| Checkout | button + summary | n/a | field + payment error | confirmation | retry | 403 | |
| Settings | skeleton | n/a | save error | saved indicator | retry | 403 | |

Also list the global pages: **404**, **500**, **403**, **429**, **maintenance**, **offline**.

---

## 2. Loading

### Thresholds

| Duration | Behavior |
| --- | --- |
| < 200ms | No indicator. Avoid flicker. |
| 200ms – 5s | In-container loading indicator. |
| > 5s | Progress indicator; determinate if progress is known. |
| Unknown / long | Indeterminate progress with explanatory text and a cancel/back path. |

### Skeleton rules

- Use skeletons for structured content: lists, cards, tables, detail pages.
- The skeleton mirrors the final layout: same number of columns, same approximate heights, same spacing.
- 3–6 placeholder rows/cards, not 20.
- Use a neutral `surface-container` fill, not a brand-colored shimmer.
- Shimmer is optional and must be disabled under `prefers-reduced-motion`.
- Mark the region `aria-busy="true"`; remove it when loaded.
- Do not use a skeleton for a button; use an inline spinner and keep the label.

### Button loading

- Keep the label visible or show `Saving…` / `Booking…`.
- Disable the button and prevent double submit while the request is in flight.
- If the request fails, restore the button and keep the user’s input.
- Do not replace the whole page with a spinner for a single action.

### Anti-patterns

- Full-screen spinner over existing content.
- A skeleton that does not match the final layout.
- A loading state that shifts the page when content arrives.
- A spinner that runs forever with no explanation.
- Disabling submit with no reason while “loading” something unrelated.

---

## 3. Empty states

An empty state is shown only when the system **knows** the region is legitimately empty. It is not a loading placeholder and not an error.

### Types

| Type | When | Must include |
| --- | --- | --- |
| First-use | The user has no items yet | Why it is empty, what to do first, a primary action, an optional sample |
| Filtered-empty | Filters/search match nothing | Active filter summary, `Clear filters`, suggestion to broaden |
| No-results | A query returned nothing | The query, spelling suggestion, browse alternative |
| Permission-empty | The user cannot see the data | Plain explanation, who to ask, a safe way back |
| Cleared | The user completed/archived everything | Acknowledgment + next relevant action |

### Shape

```
[Icon or small illustration]
Title: No bookings yet
Body: When you book a tour, your itinerary and tickets will appear here.
Primary: Explore tours
Secondary: How bookings work
```

Rules:

- Title is a short statement of the situation, not “Empty.”
- Body explains why and what happens next.
- One primary action; at most one secondary link.
- Do not use a giant illustration that pushes the action below the fold.
- Do not use an empty state to hide an error. If the fetch failed, show an error with retry.
- Filtered-empty must show the active filters and a one-click clear.

### Copy examples

- `No bookings yet. Find a trip and your itinerary will appear here. [Explore tours]`
- `No tours match these filters. Try removing “Group size: 12+” or clear all filters. [Clear filters]`
- `You do not have access to this workspace. Ask your admin to invite you, or return to your workspace. [Go back]`

---

## 4. Errors

### Field errors

- Place the message below the field, linked with `aria-describedby`.
- State what is wrong and how to fix it.
- Keep the entered value.
- Focus the first invalid field on submit; optionally show an error summary at the top for long forms.

```
Enter a date from today onward.
That email is already registered. Sign in instead, or use a different email.
Password must be at least 12 characters. Add a number or symbol to strengthen it.
```

### Section errors

Use when one region fails but the page is still usable.

```
We couldn’t load your bookings. Check your connection and try again. [Retry]
Prices are temporarily unavailable. You can still view the itinerary. [Refresh prices]
```

- Keep the rest of the page usable.
- Provide a retry action.
- If cached data is shown, label it `Last updated 10:42` and offer refresh.

### Page errors

| Code | Meaning | Page requirements |
| --- | --- | --- |
| 403 | No permission | Explain, name who can grant access, link back |
| 404 | Not found | Explain, search, home, nearest valid parent |
| 429 | Too many requests | Explain, show when to retry, do not blame the user |
| 500 | Server error | Apologize briefly, show a reference ID, retry/contact |
| 503 | Maintenance | Expected duration if known, status link |
| Offline | No connection | Explain, retry, show cached content if available |

Page error anatomy:

1. Clear title (`We couldn’t find that page`).
2. One-sentence explanation.
3. Recovery actions: retry, go back, home, search, contact.
4. Reference ID for 500s.
5. No stack traces, no internal jargon, no “Oops.”

### Partial failure

- Show what succeeded and what failed; do not blank the whole page.
- Name the failed section and offer a targeted retry.
- If the failure affects a decision (price, availability), block the action and explain why.
- If data is stale, say so and show the timestamp.

### Session expiry

- Preserve the draft where possible.
- Explain that the session expired, not that the user did something wrong.
- Offer `Sign in again` and return to the same place.
- Do not silently redirect to the login page and lose context.

### Optimistic updates

- If a mutation is optimistic, show the pending state on the item.
- On failure, roll back visibly and explain what changed.
- Do not leave a phantom item that disappears on refresh.

### Error boundaries

- Wrap independent regions so one crashed widget does not take down the page.
- Provide a fallback with a retry and a reference ID.
- Log the error; never show the raw error object to the user.

---

## 5. Success and confirmation

| Stakes | Pattern |
| --- | --- |
| Low | Inline confirmation, checkmark, or toast |
| Medium | Inline banner with next step |
| High / irreversible | Confirmation page or modal with explicit acknowledgment |
| Background | Toast with undo or a link to the result |

Rules:

- Confirm the outcome, not the click: `Booking confirmed`, not `Button clicked`.
- Include the next step: `Booking confirmed. We emailed your tickets. [View itinerary]`.
- Do not use confetti for routine saves.
- Destructive confirmation buttons use the `error` role and name the object: `Delete “Rome riverside walk”`, not `Delete`.
- The safe action is visually primary in a destructive confirmation; the destructive action is clearly marked.

---

## 6. Destructive actions and undo

- Prefer **undo** for reversible actions (archive, remove from list, cancel a draft): act immediately, show a 5–10 second undo toast.
- Use **confirmation** for irreversible actions (delete account, cancel a paid booking, remove access): modal/page with consequences and an explicit acknowledgment.
- Never use a browser `confirm()` for a product action.
- Explain what will be lost and whether it can be recovered.
- Do not pre-check the destructive option.
- After deletion, show what happened and a way back if recovery exists.

---

## 7. Offline and slow network

- Detect offline and show a persistent but non-blocking banner.
- Serve cached content where possible; label it `Offline — showing saved data`.
- Disable actions that require the network, with an explanation, or queue them and explain the queue.
- Retry automatically with backoff for transient failures; do not hammer the server.
- Show a slow-network state after 5s; do not show a spinner forever.
- Test with throttled 3G and offline in DevTools.

---

## 8. Copy formulas

### Error

```
[What happened]. [What it means / why]. [What to do next].
```

Examples:

- `We couldn’t load your bookings. The connection timed out. Check your connection and try again. [Retry]`
- `That date is no longer available. Another guest booked it while you were choosing. Pick a nearby date or join the waitlist. [See dates]`
- `Your card was declined. Your bank did not approve the charge. Try another card or contact your bank. [Try another card]`

### Empty

```
[Why it is empty]. [What to do next].
```

Examples:

- `No saved tours yet. Tap the heart on any tour to keep it here. [Browse tours]`
- `No results for “Rome in June.” Try a broader date range or search “Rome.” [Clear filters]`

### Never use

- `Something went wrong.`
- `An error occurred.`
- `Invalid input.`
- `Oops!`
- `Error 500.`
- `No data.`
- `Please try again later.` (without saying what to try or when)

---

## 9. State QA checklist

- [ ] Loading appears only after 200ms; no flicker.
- [ ] Skeleton matches the final layout and does not shift the page.
- [ ] Button loading prevents double submit and preserves input.
- [ ] First-use, filtered-empty, no-results, and permission-empty are distinct.
- [ ] Empty state has a next action.
- [ ] Field errors are specific and linked to the field.
- [ ] Section errors keep the rest of the page usable and offer retry.
- [ ] 404 and 500 are custom; 403/429/offline exist where relevant.
- [ ] 500 shows a reference ID; no stack traces.
- [ ] Session expiry preserves context.
- [ ] Optimistic updates roll back visibly.
- [ ] Success confirms the outcome and the next step.
- [ ] Destructive actions have confirmation or undo.
- [ ] All states work with keyboard, screen reader, and reduced motion.
