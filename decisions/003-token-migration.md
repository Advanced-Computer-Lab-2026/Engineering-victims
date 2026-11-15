# Decision: Token migration is a semantic rename, not a palette alias

**Date:** 2026-11-13
**Owner:** Project team
**Surface / route:** All UI files
**Status:** accepted

### Context

The app uses 1,291 Tailwind palette utilities (`bg-slate-900/60`,
`text-indigo-400`, `border-rose-800/60`) across 58 files. The system requires
components to consume semantic tokens (`--color-surface`,
`--color-on-surface-variant`) rather than primitives or appearance names.
Tailwind opacity modifiers make a `slate -> var(--color-*)` alias unreliable,
because Tailwind cannot apply `/60` to an arbitrary CSS variable without a
chaned RGB triplet.

### Options

| | Option A: Alias palette names to token values | Option B: Rename classes to semantic names |
| --- | --- | --- |
| Summary | Keep `slate`/`indigo` class names, map their values to tokens | Replace each class with a role name (`bg-surface`, `text-primary`) |
| Pros | Very small diff; instant token values | Correct role naming; opacity handled with solid tokens or `color-mix` |
| Cons | Appearance-based names persist; opacity modifiers break; still non-compliant | Large mechanical diff across 58 files |
| Reference | — | `ui-system/docs/foundations.md` §1 |
| Accessibility impact | Contrast can improve but names still hide intent | Roles make contrast and state audits possible |
| Implementation cost | Low | Medium |

### Decision

Option B. Class names are migrated in phases by screen group, and the
foundation phase deliberately leaves the palette classes in place until the
full pass. During the foundation, tokens are loaded and the brand roles are
correct, but the existing palette utilities still render; the full pass
replaces them with semantic roles and constrains the Tailwind theme.

### Consequences

- Two visual passes are expected: foundation (font, flat surface, brand file)
  then semantic tokens per screen group.
- Alpha-heavy classes are replaced with solid surface tokens or scrims, so
  translucency is reduced where it carried no meaning. Dialog backdrops use
  the `.scrim` utility, which derives its colour from `--color-scrim`.
- Type sizes and z-index now come from named scales in `tailwind.config.js`
  (`text-body`, `text-h2`, `z-modal`, ...) rather than raw `text-[13px]` and
  `z-[60]` values.
- Revisit if a future design intentionally needs translucency; use a documented
  component token rather than a raw palette value.

### Audit notes

`check.sh` reports two standing warnings that are false positives for this
codebase:

- **clickable div/span**: every match is a dialog backdrop. It is
  `aria-hidden`, not in the tab order, and duplicates the visible close button
  and the Escape handler, so it is not a keyboard-only dead end.
- **placeholder image**: every match is an `<input placeholder="...">`
  attribute, not a placeholder-image service.
