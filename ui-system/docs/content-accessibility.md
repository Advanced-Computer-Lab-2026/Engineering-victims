# Content, Assets, Accessibility, Performance

**Scope:** what the interface says, what it shows, who can use it, and how fast it loads.
**Use with:** [states.md](states.md) · [patterns.md](patterns.md) · [foundations.md](foundations.md)

## Universal rules

- Real copy, real photos, real data shapes. No lorem ipsum, no fake dashboards, no generated photos passed off as real.
- Copy answers: what happened, what it means, what to do next.
- Accessibility is a floor, not a phase. Performance is part of the design.
- Metadata is part of the page: unique title, favicon, Open Graph basics.

---

## 1. Voice and tone

**Voice:** plain, specific, calm, competent. **Tone:** adapts to the moment — reassuring in errors, concise in success, neutral in settings.

Rules:

- Use sentence case for headings, labels, and buttons.
- Use “you” and “we” when it is clear who is speaking.
- Prefer the concrete over the abstract: `Your booking is confirmed` > `Transaction completed`.
- No jargon, internal names, or database language in user-facing copy.
- No exclamation marks except in genuine celebration (rare).
- No blame: `We couldn’t verify that code` > `You entered an invalid code`.
- No humor in errors, billing, security, or destructive actions.
- Keep one idea per sentence. If a sentence needs a comma splice, split it.
- Do not use “please” to soften a command; make the instruction direct and kind.

---

## 2. Microcopy rules

### Buttons and links

- Verb + object: `Save changes`, `Book this tour`, `Send invite`, `Delete booking`.
- Avoid `Submit`, `Continue`, `OK`, `Yes/No` when the action can be named.
- A link says where it goes: `View itinerary`, not `Click here`.
- Destructive labels name the object: `Delete “Rome riverside walk”`, not `Delete`.
- One primary action per view; the label tells the user what will happen.

### Labels and hints

- Labels are specific: `Work email` when it differs from login email.
- Placeholders are examples, never labels: `e.g., Atlas Travel Services`.
- Helper text appears before the error; it explains format or consequence.
- Required/optional markers are consistent across the product.

### Success

- Confirm the outcome and the next step: `Booking confirmed. We emailed your tickets. [View itinerary]`.
- Keep it short. Do not celebrate routine saves.

### Empty

- Why it is empty + next action. See [states.md](states.md).
- Avoid “No data.” Say what would appear here and how to create it.

### Errors

- What happened + what it means + what to do next.
- Name the field or object. Offer a recovery path.
- Never use: `Something went wrong`, `An error occurred`, `Invalid input`, `Oops`.
- For 500s, include a reference ID and a support path.

---

## 3. Formats and data

- **Dates:** use the user’s locale (`Intl.DateTimeFormat`). Avoid ambiguous `03/04/2026`; use `Mar 4, 2026` in English UI.
- **Times:** include time zone when it matters (`10:00 AM CET`). Use a `<time datetime>` element.
- **Durations:** `2h 30m`, not `2.5 hours` in a compact card.
- **Currency:** use `Intl.NumberFormat` with the currency code; show the code when multiple currencies are possible (`$120 USD`).
- **Numbers:** group thousands; use tabular numerals in tables and prices.
- **Percentages:** one decimal only when it adds meaning.
- **Ranges:** en dash with spaces (`Jun 12 – Jun 18`), not a hyphen.
- **Addresses/phones:** preserve local formatting; use `tel:` links.
- **Relative time:** `2 hours ago` for recent activity; absolute date on hover/detail.
- **Pluralization:** use ICU/Intl plural rules; never `1 items`.
- **i18n:** no text in images; allow 30–40% expansion; avoid concatenated strings; support RTL if the product does.
- **Empty values:** use an em dash (`—`) with an accessible label, not `null` or `undefined`.

---

## 4. Images and media

### Sourcing

- Use real photography from licensed sources: Unsplash, Pexels, or the brand asset library.
- Record the source and license in the repo or CMS.
- Do not use AI-generated images as if they were real photography. If used, label them and keep them out of factual contexts (people, locations, products, testimonials).
- Do not hotlink random images in production; download or use a licensed CDN with stable URLs.
- Match the image to the content. A generic stock photo of “business people” is worse than a labeled placeholder.

### Implementation

- Set explicit `width`/`height` or `aspect-ratio` to prevent layout shift.
- Use `srcset`/`sizes` for responsive images; serve AVIF/WebP with fallbacks.
- `loading="lazy"` for below-the-fold images; `fetchpriority="high"` for the hero/LCP image.
- `object-fit: cover` with a deliberate `object-position` for cards.
- Provide a neutral, labeled placeholder if no real image exists: `Photo coming soon`.
- Background images are content, not decoration; provide an `img` with `alt` when meaningful.

### Alt text

- Describe the content and purpose, not the file: `A guide leading a group along the Tiber at sunset`.
- Decorative images: `alt=""` (empty, not missing).
- Images that are links: describe the destination.
- Do not start with “Image of” or “Photo of.”
- For complex charts, provide a text summary and a data table.

---

## 5. Titles, favicons, and metadata

- **Title:** unique and descriptive per route: `Bookings · Wanderly`, not `Wanderly` everywhere.
- Put the specific page first, product second. Keep under ~60 characters.
- **Description:** one sentence, specific to the page; not keyword stuffing.
- **Favicon:** product mark; SVG + 32px PNG + `apple-touch-icon` 180px. Not the framework default.
- **Manifest:** `manifest.webmanifest` with name, short_name, icons, theme_color, background_color, display.
- **Open Graph / Twitter:** title, description, image (1200×630), URL, type. Use a real image, not a gradient card.
- **Theme color:** match the surface, not the brand, so browser chrome does not clash.
- **Canonical URL** where duplicate routes exist.
- **404 page title:** `Page not found · Product`.
- **500 page title:** `Something broke on our side · Product` (the page copy can be calmer).

---

## 6. Accessibility floor (WCAG 2.2 AA)

### Structure

- Use landmarks: `header`, `nav`, `main`, `aside`, `footer`.
- One `<h1>` per page; headings descend in order; do not use headings for styling.
- Provide a “Skip to content” link as the first focusable element.
- Use lists (`ul`/`ol`) for lists, `table` for tabular data, `button` for actions, `a` for navigation.
- Never use `div`/`span` with `onClick` as a button.

### Keyboard and focus

- Every interactive element is reachable and operable by keyboard.
- Visible focus indicator on every interactive element; never remove the outline without a replacement.
- Focus order follows the visual order.
- Modals trap focus, `Esc` closes, focus returns to the trigger.
- Sticky headers must not obscure focused content; use `scroll-margin-top`.
- No keyboard traps.

### Targets and contrast

- Target size: 44×44 CSS px minimum; 48 preferred.
- Body text: 4.5:1; large text: 3:1; UI components/graphics: 3:1.
- Never use color alone for status, required fields, or errors; pair with text/icon/shape.
- Disabled content still needs to be distinguishable; do not rely on opacity alone for meaning.

### Forms

- Every input has a visible `<label>`; placeholders are not labels.
- Group related controls with `fieldset`/`legend`.
- Errors are linked with `aria-describedby`; invalid fields use `aria-invalid="true"`.
- On submit failure, focus the first error or an error summary.
- Autocomplete attributes for name, email, phone, address, payment.
- Do not disable submit as validation; explain what is missing.

### Images and media

- Meaningful images have `alt`; decorative images have `alt=""`.
- Video: captions, transcripts, no autoplay with sound, pause control.
- Audio: transcript and controls.
- Animations: no flashing more than 3 times per second.

### Dynamic content

- Use `aria-live="polite"` for status updates, `role="alert"` for urgent errors.
- Do not move focus unexpectedly except to errors/dialogs.
- Announce loading completion when it changes the page meaningfully.
- Toasts must be readable by screen readers and dismissible.

### Zoom and reflow

- 200% zoom: no horizontal scroll for content; no loss of function.
- 320px width: content reflows; tables may scroll with a clear affordance.
- Text spacing overrides do not break layout.
- Respect `prefers-reduced-motion`, `prefers-color-scheme`, and `prefers-contrast` where supported.

### Testing

- Keyboard-only pass: tab through every action; no traps; focus visible.
- Screen reader spot check: headings, landmarks, form labels, errors, dialogs.
- Automated: axe/Lighthouse; do not treat a green score as proof.
- Manual: contrast, zoom, reduced motion, 360px, slow network.

---

## 7. Performance

### Budgets

| Metric | Target |
| --- | --- |
| LCP | < 2.5s on a mid-range mobile connection |
| CLS | < 0.1 |
| INP | < 200ms |
| Initial JS | Keep the route’s critical JS small; code-split below-the-fold features |
| Fonts | ≤ 4 weights; subset; `font-display: swap`; preload only critical files |
| Images | Serve responsive sizes; no image larger than its display box |

### Rules

- Self-host Public Sans in production; preload the regular and semibold WOFF2.
- Reserve space for images, embeds, and async content; no layout shift.
- Lazy-load below-the-fold images and heavy components.
- Avoid render-blocking third-party scripts; load analytics after interaction/idle.
- Do not ship a carousel library for three static cards.
- Use system font fallbacks with matched metrics to reduce FOUT shift.
- Test on a throttled connection and a low-end device profile.
- A beautiful page that takes 8 seconds to become usable is not finished.

---

## 8. Content and accessibility checklist

- [ ] No lorem ipsum or fake data in shipped UI.
- [ ] All copy is specific; no “Something went wrong.”
- [ ] Buttons use verb + object; links say where they go.
- [ ] Dates/currency/numbers use locale-aware formatting.
- [ ] Real photos, correct aspect ratios, meaningful `alt`.
- [ ] Images have dimensions and responsive sources; no CLS.
- [ ] Unique title, description, favicon, manifest, OG image.
- [ ] Landmarks, one `h1`, descending headings, skip link.
- [ ] Keyboard, focus, modal focus trap, `Esc`, return focus.
- [ ] Labels, errors, `aria-describedby`, `aria-invalid`.
- [ ] Contrast, 44px targets, no color-only meaning.
- [ ] `prefers-reduced-motion`, 200% zoom, 320px reflow.
- [ ] LCP/CLS/INP within budget on a throttled connection.
