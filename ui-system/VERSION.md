# Version

**Version:** 2.1.0
**Released:** 2026-11-13
**Status:** stable
**Minimum browser:** last 2 versions of Chrome, Safari, Firefox, Edge

---

## What changed in 2.1.0

### Portable package

- The system is now split into a frozen core and project-owned files.
- The sample palette moved from `tokens.css` to `brand.example.css`.
- Product facts, journey, and screen inventory moved to `PRODUCT.example.md`.
- The worked travel example moved to `docs/examples/travel.md`.
- Added `docs/using-the-system.md`, `VERSION.md`, `check.sh`, and `decisions/`.
- `tokens.css` now maps every color to a `--brand-*` role with a fallback, so
  the system renders with or without a brand file.
- Dark mode is driven by `brand.css` overriding `--brand-*`; `tokens.css` only
  sets the native `color-scheme`.

### Compatibility

| Change | Breaking? | Action |
| --- | --- | --- |
| `docs/tokens.css` moved to `tokens.css` | Yes, for path references | Update imports and links |
| Color values moved to `--brand-*` roles | No, for rendered output | Keep role names |
| `design-brief.md` no longer holds product facts | Process change | Fill `PRODUCT.md` |
| `tokens.css` dark block no longer duplicates colors | Yes, if a project edited it | Move dark values to `brand.css` |

If a project edited `docs/tokens.css` directly, copy its color values into
`brand.css` as `--brand-*` roles before updating.

---

## Versioning policy

- **Patch (2.1.x):** wording, examples, typo fixes, new references.
- **Minor (2.x.0):** new tokens, new patterns, new states, additive docs.
- **Major (x.0.0):** renamed or removed tokens, changed file paths, changed
  mandatory rules.

Core rules are meant to be stable. A project may pin a version and update
deliberately; it may not fork the core silently. Exceptions belong in
`decisions/`.

---

## Package contents

```text
AGENTS.md              always-read contract
VERSION.md             this file
tokens.css             structural + semantic tokens (universal)
brand.example.css      palette + font template (copy to brand.css)
PRODUCT.example.md     product facts template (copy to PRODUCT.md)
check.sh               install and anti-pattern audit
decisions/README.md    where project decisions live
docs/                  full brief and deep dives
```

---

## Changelog

### 2.1.0 — 2026-11-13

- Split brand, product, and system files.
- Added install, update, and verification guide.
- Added `check.sh` and a versioned update policy.
- Reworded the brand rule: one family with a few related tones is fine;
  unrelated saturated accents are not.
- Added `--icon-*` and `--border-*` tokens; wired `--page-gutter` responsively.

### 2.0.0 — 2026-11-13

- Replaced the original `agents-ui.md` with a layered documentation set.
- Added `AGENTS.md`, the full brief, foundations, patterns, states, content and
  accessibility, workflow, references, Impeccable, and a decision template.
- Standardized on Public Sans, Lucide, the Atlassian spacing scale, the
  Atlassian radius scale, and Material 3 color roles.
- Removed the dependency on the workshop PDF; its lessons are inlined and
  mapped in `docs/references.md`.
