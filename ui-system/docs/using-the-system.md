# Using the System

**Audience:** a person or agent installing this UI system into a new project.
**Outcome:** the same best practices in every project; only brand color, font,
and product facts change.
**Contract:** [`../AGENTS.md`](../AGENTS.md)

---

## 1. What is portable and what changes

| Path | Owner | Editable per project? |
| --- | --- | --- |
| `tokens.css` | system | **No** |
| `docs/**` | system | **No** |
| `AGENTS.md` | system (read-only contract) | **No** |
| `brand.css` | project | Yes |
| `PRODUCT.md` | project | Yes |
| `decisions/**` | project | Yes |

Rules that never change: spacing, radius, type scale, motion, patterns, states,
content rules, accessibility, workflow.

What changes: brand palette, typeface (occasionally), icon set (rarely and only
with a decision), product facts, and the journey.

---

## 2. Install

### 2.1 Copy the package

```text
project/
├── AGENTS.md              # short pointer block added to yours
├── ui-system/             # this package, copied whole
│   ├── AGENTS.md
│   ├── VERSION.md
│   ├── tokens.css
│   ├── brand.example.css
│   ├── PRODUCT.example.md
│   ├── check.sh
│   └── docs/
├── brand.css              # copied from brand.example.css
├── PRODUCT.md             # copied from PRODUCT.example.md
├── decisions/
└── src/
```

```bash
cp -R ui-system /path/to/project/ui-system
cp ui-system/brand.example.css /path/to/project/brand.css
cp ui-system/PRODUCT.example.md /path/to/project/PRODUCT.md
mkdir -p /path/to/project/decisions
```

Do **not** copy `brand.example.css` or `PRODUCT.example.md` into `src/`.

### 2.2 Add the pointer to the project's AGENTS.md

Agents auto-read the root `AGENTS.md`. Keep it short and point at the system:

```md
## UI/UX

Before touching any UI file, read `ui-system/AGENTS.md`, then `PRODUCT.md`
and `brand.css`.

- `ui-system/**` is read-only. Replace it wholesale to update.
- Brand palette and font: `brand.css` only.
- Product facts and journey: `PRODUCT.md`.
- Exceptions: `decisions/` (one record per decision).
```

If the project has no `AGENTS.md`, create one with that block. Do not duplicate
the 12 non-negotiables at the project root; they would drift.

### 2.3 Wire the CSS

Import the brand first, then the system:

```css
/* src/styles/main.css or the app entry */
@import "../brand.css";
@import "../ui-system/tokens.css";
```

With a bundler, the equivalent order is:

```js
import "../brand.css";
import "../ui-system/tokens.css";
```

Why this order: `tokens.css` reads `--brand-*` at computed-value time, so the
brand may load first. The reverse order also works for custom properties, but
the documented order avoids surprises with `@layer` and non-custom rules.

### 2.4 Fonts

Public Sans is the default. Self-host WOFF2 in production:

```css
@font-face {
  font-family: "Public Sans";
  src: url("/fonts/public-sans-variable.woff2") format("woff2");
  font-weight: 400 700;
  font-display: swap;
}
```

Keep the SIL OFL license file. Preload only regular and semibold. Do not ship a
third-party Google Fonts import in production.

---

## 3. Change the brand

### 3.1 Recommended: Material Theme Builder

1. Open <https://material-foundation.github.io/material-theme-builder/>.
2. Enter one source color.
3. Export the Material 3 light and dark schemes.
4. Paste the role values into `brand.css`, keeping the `--brand-*` names.
5. Keep the six status roles (`success`, `warning`, `info`) sensible and
   contrast-checked; Material Theme Builder does not generate them.
6. Run `./ui-system/check.sh`.

Why: HCT tonal palettes keep contrast predictable. Hand-picking hex values
breaks the “one family, neutral surfaces” rule almost immediately.

### 3.2 Optional: generate from one color in Node

For projects that want a one-line brand change, add a small generator using
`@material/material-color-utilities`. It reads `brand.config.json` and writes
`brand.css`.

```json
{ "sourceColor": "#00696b", "fontSans": "Public Sans" }
```

Trade-off: true one-color automation, but a build dependency. The system does
not ship the generator by default; add it only if the project asks.

### 3.3 Not recommended: derive the palette in CSS

`oklch()` and `color-mix()` can approximate tones, but they do not follow HCT
and routinely fail contrast in dark mode. Do not replace the brand file with
runtime color math.

### 3.4 Dark mode is mandatory in the brand file

`brand.css` must define every role twice: once in `:root` (light) and once in
both dark blocks:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* --brand-* dark values */ }
}
[data-theme="dark"] { /* identical --brand-* dark values */ }
```

`check.sh` fails when a role is missing from the light block or from the dark
block.

### 3.5 Change the font

Only one variable changes:

```css
--brand-font-sans: "Your Font", ui-sans-serif, system-ui, sans-serif;
```

Keep the type scale. If the new font has a very different x-height or width,
adjust `--leading-*` once and record the exception in `decisions/`. Do not
resize individual headings.

### 3.6 Change the icon set

Icons are not a CSS token. Changing the set is a dependency and a design
decision:

1. Ask first.
2. Use one family, one stroke width, one optical grid.
3. Record the decision in `decisions/`.
4. Update [`docs/foundations.md`](foundations.md) §8 and the project `AGENTS.md`
   pointer.

---

## 4. Fill the product file

Copy `PRODUCT.example.md` to `PRODUCT.md` and answer:

1. Who is the user?
2. What is the one job of the product and of each screen?
3. What are the entry points and the next step?
4. What data is required, and what happens when it is missing?
5. What are the constraints and non-goals?
6. What is the success signal?

Do not invent facts. Leave an open question in `PRODUCT.md` rather than guessing
in the UI. See the filled example: [`examples/travel.md`](examples/travel.md).

---

## 5. Verify the install

```bash
# from the project root
./ui-system/check.sh
```

The script checks:

- the system files exist and the CSS braces balance;
- the structural tokens are present;
- every required `--brand-*` role exists in light and dark;
- no gradients, Inter defaults, emoji UI, generic errors, clickable `div`s, or
  hover-only actions in `src/` (warnings, not blockers);
- no hardcoded hex values in components (warning; tokens are the target).

Then look at the app at 360, 768, 1200, and 1440 px, keyboard-only, at 200%
zoom, with `prefers-reduced-motion: reduce`, and on a throttled connection.

---

## 6. Update the system later

```bash
# replace the system, keep project files
rm -rf ui-system
cp -R /path/to/new/ui-system ui-system
./ui-system/check.sh
```

- Keep `brand.css`, `PRODUCT.md`, and `decisions/`.
- Read `ui-system/VERSION.md` for breaking changes.
- Diff the docs you rely on; do not re-add local edits to core files.
- If a project needs a different rule, record it in `decisions/` instead of
  editing the system.

---

## 7. File ownership cheat sheet

| If you need to… | Edit |
| --- | --- |
| Change the palette | `brand.css` |
| Change the font | `brand.css` (`--brand-font-sans`) |
| Describe users, jobs, journey, screens | `PRODUCT.md` |
| Record a design trade-off or exception | `decisions/NNN-name.md` |
| Change spacing, radius, type scale, motion | nothing — the scale is fixed |
| Add a missing semantic token | `ui-system/tokens.css` + a version note |
| Add or change a pattern rule | `ui-system/docs/patterns.md` |
| Add a required state | `ui-system/docs/states.md` |

“Add a missing semantic token” is a system change, not a project change. If it
is genuinely universal, propose it upstream; if it is project-specific, use a
component token in `brand.css` or a local stylesheet instead.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Page renders with default teal and ignores `brand.css` | Brand imported after `tokens.css` in a bundler, or `--brand-*` names misspelled | Import `brand.css` first; run `check.sh` |
| Dark mode stays light | Brand dark blocks missing, or `data-theme` set on `body` | Define both dark blocks; set `data-theme` on `<html>` |
| Colors right, font wrong | `--brand-font-sans` missing or font not loaded | Set the variable; self-host the WOFF2 |
| Spacing looks off | A component uses raw px | Replace with `--space-*`; the scale is fixed |
| `check.sh` reports missing roles | Generated palette used different names | Rename to the `--brand-*` list in `brand.example.css` |
| Focus ring disappears | Ring color equals the surface | `--focus-ring-color` follows `--color-primary`; verify 3:1, or use a contrast-safe ring token |

---

## 9. Definition of a correct install

- [ ] `ui-system/` is untouched.
- [ ] `brand.css` defines light and dark roles and the font.
- [ ] `PRODUCT.md` is filled; no bracketed placeholders remain.
- [ ] Import order is brand → tokens.
- [ ] `check.sh` passes with no errors.
- [ ] One screen rendered and checked at 360/768/1200/1440.
- [ ] Keyboard, focus, contrast, and reduced motion spot-checked.
- [ ] `decisions/` exists (copy the package's `decisions/README.md` if you
      want the convention); at least one decision is recorded for any
      non-trivial choice.
