# Decision 010: Admin Panel Design System

**Date:** 2024-01-XX  
**Status:** Accepted  
**Context:** UI refresh following professional admin panel patterns

## Problem

Current UI feels generic and lacks the professional dashboard aesthetic expected for university administration systems. Need a design that:
- Looks professional and authoritative
- Clear visual hierarchy for data-heavy interfaces
- Strong contrast for readability
- Familiar to staff who use admin tools

## Decision

**Admin panel aesthetic with:**
1. **Black sidebar (#1a1a1a)** - Establishes authority, reduces eye strain, modern
2. **Yellow accent (#fbbf24)** - High contrast, draws attention to important actions/data
3. **Light content area (#f9fafb)** - Maximum readability for tables and forms
4. **Card-based dashboard** - Modular, scannable, responsive
5. **Top bar with user controls** - Notifications, profile, sign out

## Visual Hierarchy

- **Sidebar:** Black background, white text, yellow badges/highlights
- **Main area:** Light gray background, white cards with subtle shadows
- **Primary actions:** Yellow buttons/badges
- **Data cards:** White with colored accent bars (yellow, green, red based on status)
- **Charts:** Yellow primary line, gray fills

## References

- Vercel Dashboard - black sidebar, modern card layout
- Stripe Dashboard - data-first, clear typography
- Linear - minimalist, high contrast
- The provided admin panel screenshot - yellow accent, black sidebar, clean cards

## Typography

- Keep Public Sans (professional, designed for UI)
- Use font weights for hierarchy: 400 (body), 500 (labels), 600 (headings), 700 (numbers)
- Larger numbers for metrics (3rem+)

## Color Palette

```
Primary (Yellow): #fbbf24
Sidebar: #1a1a1a
Surface: #ffffff
Background: #f9fafb
Text: #111827
Text muted: #6b7280
Success: #10b981
Error: #ef4444
Info: #3b82f6
```

## Consequences

- More distinctive than generic teal/emerald
- Better for data-heavy admin interfaces
- High contrast improves accessibility
- Yellow requires careful use (too much is overwhelming)
- Black sidebar may need theme toggle for user preference
