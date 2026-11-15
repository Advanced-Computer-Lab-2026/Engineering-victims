# AGENTS.md — Project pointer

## UI/UX

Before touching any UI file, read `ui-system/AGENTS.md`, then `PRODUCT.md`
and `brand.css`.

- `ui-system/**` is read-only. Replace it wholesale to update.
- Brand palette and font: `brand.css` only.
- Product facts and journey: `PRODUCT.md`.
- Exceptions: `decisions/` (one record per decision).

This project is in a UI/UX-only phase. Do not change API contracts, data
models, workflow rules, or fix features that are already broken. Do not add
features.
