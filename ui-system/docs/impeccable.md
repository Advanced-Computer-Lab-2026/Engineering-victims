# Claude Impeccable Skill

**What it is:** an open-source design skill/plugin for AI coding agents, created by Paul Bakaus. It gives an agent a design vocabulary, a review process, and a detector for “AI slop” patterns. It started from Anthropic’s `frontend-design` skill and is licensed Apache 2.0.

**What it is not:** a replacement for this brief. Impeccable is a process and review tool; the project’s design brief, tokens, and constraints are the law.

- Site: https://impeccable.style/
- Repository: https://github.com/pbakaus/impeccable
- Docs: https://impeccable.style/docs
- License: Apache 2.0

---

## 1. Why it is relevant

Left alone, agents converge on the same defaults:

- Inter for everything.
- Purple-to-blue gradients.
- Cards nested in cards.
- A rounded icon tile above every heading.
- Gray text on colored backgrounds.
- A generic “Something went wrong” error.

Impeccable names those tells and gives the agent commands to move away from them. Its detector has 60+ deterministic rules, and its review commands score hierarchy, usability, accessibility, and polish.

Use it **in addition to** [AGENTS.md](../AGENTS.md), not instead of it.

---

## 2. How it thinks

### Modes

Impeccable chooses a mode based on the surface, not the product:

| Mode | Visitor’s success | Examples |
| --- | --- | --- |
| **Persuade** | Decides and acts | Landing pages, marketing, pricing |
| **Operate** | Completes a task | Dashboards, settings, admin, tools |
| **Read** | Understands something | Docs, articles, guides |
| **Experience** | Is inside the work | Portfolios, galleries, showcases |

A tool’s landing page is still **Persuade**; a fashion house’s docs are **Read**. The mode changes how much expression is appropriate: Operate and Read value precision and restraint; Persuade and Experience can take more risk.

### Context files

- `PRODUCT.md` — who the product is for, what it does, constraints. This is the
  project file in this system, copied from [../PRODUCT.example.md](../PRODUCT.example.md).
- `DESIGN.md` — the visual system: type, color, spacing, components, motion. In
  this system that is [foundations.md](foundations.md) plus [tokens.css](../tokens.css)
  and `brand.css`; do not create a second, conflicting `DESIGN.md`.
- Surface briefs — per-page mode and constraints.

These map closely to the product file and the foundations. If both exist, keep
them consistent; do not maintain two conflicting sources of truth.

---

## 3. Commands

Impeccable ships ~24 commands. The most useful for this system:

| Command | What it does | When to use |
| --- | --- | --- |
| `init` | Captures product context in `PRODUCT.md` | Start of a project |
| `document` | Generates `DESIGN.md` from existing code | Existing project with no system doc |
| `shape` | Plans UX/UI before code | New feature or flow |
| `critique` | Scored UX review with heuristic ranking | Before a redesign |
| `audit` | Technical quality: a11y, perf, responsive | Before shipping |
| `polish` | Final quality pass | Last 10% |
| `harden` | Errors, i18n, overflow, edge cases | Production readiness |
| `clarify` | Rewrites unclear copy, labels, errors | Copy pass |
| `onboard` | First-run flows and empty states | Activation |
| `animate` | Purposeful motion | Interaction feedback |
| `typeset` | Type hierarchy and fonts | Typography pass |
| `layout` | Spacing, rhythm, hierarchy | Layout pass |
| `colorize` | Strategic color in a gray UI | When the UI is too flat |
| `bolder` / `quieter` | Amplify or tone down | Direction is safe or loud |
| `distill` | Strip to essence | Too much UI |
| `adapt` | Device/screen adaptation | Responsive pass |
| `optimize` | Loading/rendering performance | Performance pass |
| `extract` | Pull tokens/components into a system | Design-system cleanup |
| `live` | Pick elements in the browser and iterate variants | Local dev server |
| `generate` | Variants of a named element | Exploration |

Run `/impeccable` with no argument to see the menu. Pin a frequent command with `/impeccable pin audit`.

---

## 4. Installation and use

The current install path:

```bash
npx impeccable install
```

Then reload the agent and run:

```text
/impeccable init
```

On Codex, use `$impeccable`; on other harnesses, the slash command may differ. Impeccable supports Claude Code, Cursor, Codex CLI, GitHub Copilot, OpenCode, Gemini CLI, and others. See the repo for the current matrix.

The detector can run without an agent:

```bash
npx impeccable detect src/
npx impeccable detect http://localhost:5173
npx impeccable detect --json .
npx impeccable detect --list-rules
```

The design hook scans UI files after edits and surfaces findings before the agent declares done. Review the hook before enabling it in an unfamiliar repo; like any hook, it runs outside the model’s approval in some harnesses.

---

## 5. How to use it with this brief

### Recommended sequence

1. **Read [AGENTS.md](../AGENTS.md)**, then fill [../PRODUCT.example.md](../PRODUCT.example.md) → `PRODUCT.md` and `brand.css`.
2. **Run `init`** to capture product context — or keep `PRODUCT.md` as the single source and skip a duplicate.
3. **Run `document`** if the codebase already has a visual system; reconcile it with [foundations.md](foundations.md), [tokens.css](../tokens.css), and `brand.css`.
4. **Use `shape`** for a new flow; compare its output with the journey and screen inventory in `PRODUCT.md`.
5. **Use `critique` and `audit`** on the target screen, then fix findings by severity.
6. **Use `polish` and `harden`** before shipping.
7. **Run the detector** in CI or locally, and keep the hook on if the team agrees.

### Division of authority

| Question | Authority |
| --- | --- |
| What are we building, for whom? | `PRODUCT.md` |
| What is the design method and direction? | [design-brief.md](design-brief.md) |
| What are the tokens, type, color, spacing? | [foundations.md](foundations.md) / [tokens.css](../tokens.css) / `brand.css` |
| What is the pattern/state contract? | [patterns.md](patterns.md) / [states.md](states.md) |
| How do we review and improve? | Impeccable commands + [workflow-and-review.md](workflow-and-review.md) |
| What is “AI slop”? | Impeccable detector + this brief’s anti-patterns |

If Impeccable suggests a direction that conflicts with the brief, the brief wins. Record the conflict; do not silently override brand, typography, or accessibility constraints.

---

## 6. Boundaries and cautions

- **Do not auto-install.** Adding Impeccable (or its hook) is a project decision. Ask first.
- **Do not let it rewrite copy blindly.** `clarify` is useful, but factual copy, legal text, and error messages need human review.
- **Do not accept a visual change without looking.** Impeccable is strong, not infallible; run the screen at 360/768/1200/1440 and keyboard-only.
- **Do not let it add dependencies or assets.** The brief’s “no new dependencies without asking” still applies.
- **Respect telemetry/privacy.** Impeccable may fetch visual directions and record anonymous choices; disable telemetry in restricted environments.
- **Live mode edits a local checkout only.** Do not inject it into a deployed site or weaken a production CSP.
- **Keep one source of truth.** If you use `PRODUCT.md`/`DESIGN.md`, make them agree with the docs here; do not duplicate conflicting rules.

---

## 7. Suggested prompts

```text
/impeccable critique the booking results page
/impeccable audit the checkout flow
/impeccable polish the settings screen
/impeccable harden the sign-up form
/impeccable clarify the error and empty states
/impeccable adapt the dashboard for mobile
/impeccable typeset the marketing page
/impeccable layout the tour detail page
```

Pair each with the relevant doc:

```text
Use docs/patterns.md §4 for the filter behavior and docs/states.md for the
empty/error states. Then run /impeccable critique on the results page.
```

---

## 8. What to keep from Impeccable

- The **modes** language: decide whether the surface is Persuade, Operate, Read, or Experience before styling it.
- The **two-pass review**: `critique` for UX, `audit` for technical quality.
- The **anti-slop detector** as a CI/check hook, not a substitute for judgment.
- The **design vocabulary**: “quieter,” “bolder,” “distill,” “harden,” “clarify” are useful ways to steer an agent.
- The **context files**: product truth and visual system should be written down, not implied.

Everything else — brand, tokens, accessibility, content, component rules — comes from this brief.
