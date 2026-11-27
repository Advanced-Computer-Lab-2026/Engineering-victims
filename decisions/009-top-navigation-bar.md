# Decision 009: Top Navigation Bar + Sidebar Layout

**Date:** 2024-01-XX  
**Status:** Accepted  
**Context:** UI refresh  

## Problem

Current sidebar-only layout:
- Hides GUC branding when sidebar is collapsed
- Wastes vertical space on wide screens
- Differs from standard university portal patterns (Canvas, Blackboard, Banner all use top bars)
- Logo/identity is not persistently visible

## Decision

**Two-tier navigation:**
1. **Top bar (64px fixed)** - global actions, branding, user menu, notifications
2. **Left sidebar** - page navigation (collapsible on mobile)

Top bar contains:
- GUC logo + "USMS" wordmark (always visible)
- Global search (future)
- Notifications icon with badge
- User profile menu with sign out

## References

- **GitHub** - top bar for branding/actions, sidebar for repo navigation
- **Canvas LMS** - persistent top bar with institution branding
- **Atlassian Jira** - two-tier: global top bar + project sidebar

## Alternatives Considered

- **Sidebar only (current)** - branding not persistent, non-standard for academia
- **Top bar only** - too many nav items for horizontal space
- **Mega menu** - overkill for role-based navigation

## Implementation

- New `TopNavBar.tsx` component
- Height: 64px (--space-64 token)
- Z-index: `z-50` (below modals, above content)
- Sidebar top-padding adjusts to avoid overlap
- Mobile: hamburger in top bar toggles sidebar

## Consequences

- More familiar pattern for academic users
- Persistent branding improves institutional identity
- Slight reduction in vertical content space
- Requires refactoring app shell layout
