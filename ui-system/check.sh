#!/usr/bin/env bash
# ==========================================================================
# check.sh — system install check and anti-pattern audit
# --------------------------------------------------------------------------
# Usage:
#   ./ui-system/check.sh          # from a project that vendors ui-system/
#   ./check.sh                    # from the system repo itself
#
# Exit code 0 = no errors. Warnings do not fail the build.
# Requires: bash, grep, awk. python3 is optional (better emoji detection).
# ==========================================================================
set -uo pipefail

SYSTEM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SYSTEM_DIR")"

# Standalone package (this repo) or vendored into a project?
if [ -f "$PARENT_DIR/brand.css" ]; then
  PROJECT_DIR="$PARENT_DIR"
  BRAND_FILE="$PARENT_DIR/brand.css"
elif [ -f "$SYSTEM_DIR/brand.css" ]; then
  PROJECT_DIR="$SYSTEM_DIR"
  BRAND_FILE="$SYSTEM_DIR/brand.css"
else
  PROJECT_DIR="$SYSTEM_DIR"
  BRAND_FILE=""
fi

TOKENS_FILE="$SYSTEM_DIR/tokens.css"
ERRORS=0
WARNINGS=0

error() { printf '  ERROR  %s\n' "$1"; ERRORS=$((ERRORS + 1)); }
warn()  { printf '  WARN   %s\n' "$1"; WARNINGS=$((WARNINGS + 1)); }
ok()    { printf '  ok     %s\n' "$1"; }

printf '\nUI system check\n'
printf '  system:  %s\n' "$SYSTEM_DIR"
printf '  project: %s\n' "$PROJECT_DIR"
printf '  brand:   %s\n\n' "${BRAND_FILE:-none (fallback palette)}"

# ---------- 1. Required files ---------------------------------------------
printf 'Files\n'
for f in AGENTS.md VERSION.md tokens.css docs/design-brief.md \
         docs/foundations.md docs/patterns.md docs/states.md \
         docs/content-accessibility.md docs/workflow-and-review.md; do
  if [ -f "$SYSTEM_DIR/$f" ]; then
    ok "$f"
  else
    error "missing $f"
  fi
done

if [ -z "$BRAND_FILE" ]; then
  warn "brand.css not found; rendering the fallback palette (light only)"
fi

if [ ! -f "$PROJECT_DIR/PRODUCT.md" ]; then
  warn "PRODUCT.md not found; product facts are unfilled"
fi

# ---------- 2. CSS sanity -------------------------------------------------
printf '\nCSS\n'
if [ -f "$TOKENS_FILE" ]; then
  read -r OPEN CLOSE <<<"$(awk '{o += gsub(/\{/, "{"); c += gsub(/\}/, "}")} END {print o, c}' "$TOKENS_FILE")"
  if [ "$OPEN" = "$CLOSE" ]; then
    ok "tokens.css braces balanced ($OPEN)"
  else
    error "tokens.css braces unbalanced ($OPEN open, $CLOSE close)"
  fi
else
  error "tokens.css not found"
fi

for token in --font-sans --text-body --space-16 --radius-lg \
             --color-primary --color-on-surface --focus-ring-width \
             --tap-target-min --duration-base; do
  if grep -q -- "$token:" "$TOKENS_FILE" 2>/dev/null; then
    ok "token $token"
  else
    error "missing structural token $token"
  fi
done

# System files must alias brand roles, not own a palette.
if grep -qE '^[[:space:]]*--(teal|blue|purple|indigo|pink|red|green|orange)-[0-9]+:' "$TOKENS_FILE" 2>/dev/null; then
  error "tokens.css contains a primitive palette; move it to brand.css"
fi

# ---------- 3. Brand roles ------------------------------------------------
ROLES="
primary on-primary primary-container on-primary-container
secondary on-secondary secondary-container on-secondary-container
tertiary on-tertiary tertiary-container on-tertiary-container
error on-error error-container on-error-container
success on-success success-container on-success-container
warning on-warning warning-container on-warning-container
info on-info info-container on-info-container
surface on-surface surface-variant on-surface-variant
surface-container-lowest surface-container-low surface-container
surface-container-high surface-container-highest
outline outline-variant
inverse-surface inverse-on-surface inverse-primary
scrim shadow
"

printf '\nBrand roles\n'
if [ -n "$BRAND_FILE" ]; then
  MISSING_LIGHT=""
  MISSING_DARK=""
  for role in $ROLES; do
    if ! grep -q -- "--brand-$role:" "$BRAND_FILE"; then
      MISSING_LIGHT="$MISSING_LIGHT $role"
    fi
    if ! awk -v name="--brand-$role:" '
      /prefers-color-scheme: dark|\[data-theme="dark"\]/ { dark = 1 }
      dark && index($0, name) { found = 1 }
      END { exit(found ? 0 : 1) }
    ' "$BRAND_FILE"; then
      MISSING_DARK="$MISSING_DARK $role"
    fi
  done

  if [ -z "$MISSING_LIGHT" ]; then
    ok "all light roles present"
  else
    error "missing light roles:$MISSING_LIGHT"
  fi

  if [ -z "$MISSING_DARK" ]; then
    ok "all dark roles present"
  else
    error "missing dark roles:$MISSING_DARK"
  fi

  if grep -q -- '--brand-font-sans:' "$BRAND_FILE"; then
    ok "font override present"
  else
    warn "--brand-font-sans missing; Public Sans fallback is used"
  fi
fi

# ---------- 4. Source audit ----------------------------------------------
UI_DIRS=()
for d in src app pages components styles; do
  [ -d "$PROJECT_DIR/$d" ] && UI_DIRS+=("$PROJECT_DIR/$d")
done

printf '\nSource audit\n'
if [ ${#UI_DIRS[@]} -eq 0 ]; then
  warn "no src/app/pages/components/styles directory; skipped"
else
  count() { grep -rnE "$1" "${UI_DIRS[@]}" 2>/dev/null | wc -l | tr -d ' '; }

  n=$(count '(linear|radial|conic)-gradient')
  [ "$n" -gt 0 ] && warn "$n gradient declaration(s)" || ok "no gradient surfaces"

  n=$(count "font-family[^;]*Inter|['\"]Inter['\"]")
  [ "$n" -gt 0 ] && warn "$n Inter font reference(s)" || ok "no Inter default"

  n=$(count '#[0-9a-fA-F]{3,8}\b')
  [ "$n" -gt 0 ] && warn "$n hardcoded hex value(s)" || ok "no hardcoded hex values"

  n=$(count '<(div|span)[^>]*onClick')
  [ "$n" -gt 0 ] && warn "$n clickable div/span element(s)" || ok "no clickable div/span"

  n=$(count 'something went wrong|an error occurred|invalid input|oops!')
  [ "$n" -gt 0 ] && warn "$n generic error message(s)" || ok "no generic error copy"

  n=$(count '(placeholder\.com|placehold|picsum|dummyimage|placekitten)')
  [ "$n" -gt 0 ] && warn "$n placeholder image(s)" || ok "no placeholder image services"

  # Emoji as UI: python3 is more portable than grep -P.
  if command -v python3 >/dev/null 2>&1; then
    n=$(python3 - "${UI_DIRS[@]}" <<'PY'
import pathlib, re, sys
pat = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")
count = 0
for root in sys.argv[1:]:
    for p in pathlib.Path(root).rglob("*"):
        if p.suffix.lower() in {".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".html", ".css"}:
            try:
                count += len(pat.findall(p.read_text(encoding="utf-8", errors="ignore")))
            except OSError:
                pass
print(count)
PY
)
    [ "$n" -gt 0 ] && warn "$n emoji character(s) in UI files" || ok "no emoji UI"
  fi
fi

# ---------- 5. Product file ----------------------------------------------
printf '\nProduct file\n'
if [ -f "$PROJECT_DIR/PRODUCT.md" ]; then
  if grep -q '\[name + one sentence\]' "$PROJECT_DIR/PRODUCT.md"; then
    warn "PRODUCT.md still contains template placeholders"
  else
    ok "PRODUCT.md looks filled"
  fi
fi

# ---------- Summary -------------------------------------------------------
printf '\nSummary: %d error(s), %d warning(s)\n\n' "$ERRORS" "$WARNINGS"
if [ "$ERRORS" -gt 0 ]; then
  printf 'Fix errors before shipping. Warnings are review items.\n\n'
  exit 1
fi
printf 'No errors. Review warnings, then verify visually at 360/768/1200/1440.\n\n'
exit 0
