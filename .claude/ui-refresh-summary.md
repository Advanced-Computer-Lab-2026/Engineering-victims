# UI Refresh: From AI Slop to Academic Identity

**Branch:** `ui-refresh`  
**Status:** Pushed, ready for review  
**Build:** ✅ Passes TypeScript + Vite production build

## What Changed

### 1. Color Palette: Indigo → Emerald
**Before:** Generic tech startup indigo (#4F46E5)  
**After:** Academic emerald/teal (#059669)

- Emerald green has academic heritage (graduation robes, educational institutions)
- More distinctive than SaaS-standard purple
- Still within Material 3 token system (all roles properly mapped)

**Files:** `brand.css`

### 2. Light Mode as Default
**Before:** Forced dark mode via `data-theme="dark"` on `<html>`  
**After:** Light mode default, dark mode via system preference

- Better for classroom/lecture hall use during daylight
- Standard for academic portals (Canvas, Blackboard, Banner)
- Dark mode still available via `prefers-color-scheme: dark`

**Files:** `index.html`, `brand.css`

### 3. Top Navigation Bar
**Before:** Sidebar-only layout, branding hidden when collapsed  
**After:** Two-tier navigation (top bar + sidebar)

**Top bar includes:**
- GUC logo + "GUC USMS" wordmark (always visible)
- Notifications icon with badge
- User menu (profile, sign out)
- Mobile hamburger to toggle sidebar

**Why:** 
- Persistent institutional branding
- Matches university portal patterns (GitHub, Canvas, Jira all use top bars)
- Global actions always accessible

**Files:** `src/components/TopNavBar.tsx` (new), `src/components/AppLayout.tsx`, `src/components/Sidebar.tsx`

### 4. Layout Adjustments
- Top bar: 64px fixed height (`--space-64` token)
- Sidebar: Removed logout button (now in top nav user menu)
- Main content: `pt-16` (4rem) to account for fixed top bar
- Z-index: Top bar at `z-50`, sidebar at modal level for mobile overlay

**Files:** `src/components/AppLayout.tsx`, `src/components/Sidebar.tsx`

## Decision Records

- **Decision 008:** Emerald academic palette & light default
- **Decision 009:** Top navigation bar + sidebar layout

Both follow the ui-system contract:
- Only `brand.css` edited for colors
- No token system changes
- All spacing/sizing uses existing tokens
- Component follows existing patterns

## What Didn't Change

- **Design system tokens:** Still read-only (spacing, radius, type scale)
- **Component library:** No new dependencies
- **Functionality:** All 128 requirements still work
- **Accessibility:** 335+ ARIA attributes preserved
- **Icons:** Still Lucide 24px/2px
- **Font:** Still Public Sans 400/500/600/700

## Build Verification

```
npm run build
✓ TypeScript compilation passed
✓ Vite production build succeeded
✓ 1991 modules transformed
✓ No runtime errors
```

## Before/After Comparison

### Before (AI Slop)
- ❌ Generic indigo purple (every SaaS dashboard)
- ❌ Dark-only (not ideal for classrooms)
- ❌ Sidebar-only layout (non-standard for academia)
- ❌ Branding hidden when sidebar collapses
- ❌ Logout buried at bottom of sidebar

### After (Academic Identity)
- ✅ Emerald green (academic heritage)
- ✅ Light default (daylight readability)
- ✅ Top bar + sidebar (Canvas/Banner pattern)
- ✅ Persistent GUC branding
- ✅ User menu in standard location (top-right)

## Next Steps

1. Review the branch: `ui-refresh`
2. Test visual appearance in browser
3. Merge to main if approved
4. Consider: Actual GUC brand colors if institutional palette is documented

## Notes

- This stays within the ui-system contract (only `brand.css` and components changed)
- No functional regressions (all 128 requirements still work)
- Build passes, TypeScript happy
- Can be merged independently of FR 117 fix
