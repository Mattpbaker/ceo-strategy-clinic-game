# Player Dashboard Layout Redesign — Design Spec

**Date:** 2026-03-26
**Status:** Approved

## Problem

The Strategy Decision card is visually overloaded:
- 5 budget inputs with always-visible description paragraphs make the section tall and dense
- Focus action and risk posture selects are stacked vertically with their own always-visible descriptions beneath each
- No visual grouping between budget / focus / posture / submit sections
- The 5-across auto-fit budget grid wraps unpredictably at intermediate screen widths

## Solution Overview

Targeted restructure of the Strategy Decision card layout. No other sections of the player dashboard are affected. Two files change: `components/player-dashboard.tsx` and `app/globals.css`.

---

## Change 1: Description reveal on hover/focus

All description paragraphs beneath budget inputs, focus action select, and risk posture select become hidden by default. They reveal with a smooth CSS transition when the user hovers over or focuses within the parent `<label>`.

**CSS mechanism:**

Add a `.field-hint` class to all description `<p>` elements. Default state is hidden. Reveal state triggered by `label:hover` or `label:focus-within`:

```css
.field-hint {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  margin-top: 0;
  transition: opacity 180ms ease, max-height 200ms ease, margin-top 150ms ease;
}

label:hover .field-hint,
label:focus-within .field-hint {
  opacity: 1;
  max-height: 5rem;
  margin-top: 0.3rem;
}
```

**Implementation:** In `player-dashboard.tsx`, add `className="field-hint"` to the description `<p>` elements for budget fields, focus action, and risk posture. Remove the inline `style={{ marginTop: "0.3rem" }}` from those elements (the CSS class handles it). The interaction type description box in the Intel Center drawer is a different component and is **not changed**.

---

## Change 2: Budget inputs — 3+2 grid

Replace the `.metrics-grid.compact` wrapper with a new `.budget-grid` class that uses a fixed 3-column layout.

**Layout:** Row 1 — Growth, People, Resilience. Row 2 — Brand, Compliance (each spanning one column, leaving the third column empty on that row).

```css
.budget-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}
```

**Implementation:** In `player-dashboard.tsx`, replace `<div className="metrics-grid compact">` with `<div className="budget-grid">`. No other changes to the budget input rendering.

---

## Change 3: Focus action + risk posture — side by side

The two selects (and their labels) move into a 2-column row. A thin section divider appears above this row to visually separate it from the budget section.

**CSS:**

```css
.decision-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(255, 215, 0, 0.1);
  margin-bottom: 0;
}

.decision-row label {
  margin-bottom: 0;
}
```

**Implementation:** In `player-dashboard.tsx`, wrap the two focus action and risk posture `<label>` blocks in a `<div className="decision-row">`. Remove the individual `margin-bottom` from labels inside this wrapper (handled by the CSS class).

---

## Change 4: Submit area separator

A subtle divider and tighter spacing between the focus/posture row and the submit button area.

**Implementation:** Wrap the submit button and the `<p className="small">Budget total...</p>` and locked reason lines in a `<div className="decision-submit">`:

```css
.decision-submit {
  padding-top: 0.85rem;
  border-top: 1px solid rgba(255, 215, 0, 0.1);
}
```

The submit button and budget total line are already present — this just wraps them with top spacing and a divider.

---

## Final Card Structure

```
STRATEGY DECISION
─────────────────────────────────────────────────
[ Growth ]     [ People ]     [ Resilience ]
[ Brand  ]     [ Compliance ]
(descriptions reveal on hover/focus per field)
─────────────────────────────────────────────────
[ Focus Action ▾ ]    [ Risk Posture ▾ ]
(descriptions reveal on hover/focus per select)
─────────────────────────────────────────────────
Budget total: 85%
[ SUBMIT DECISION ]
```

---

## Files to Modify

| File | Change |
|------|--------|
| `app/globals.css` | Add `.field-hint`, `.budget-grid`, `.decision-row`, `.decision-submit` CSS classes |
| `components/player-dashboard.tsx` | Add `className="field-hint"` to description paragraphs; replace `.metrics-grid.compact` with `.budget-grid`; wrap focus+posture labels in `.decision-row`; wrap submit area in `.decision-submit` |

---

## Out of Scope

- Any other dashboard sections (hero, priority grid, analytics, leaderboard, debrief)
- Facilitator dashboard
- Intel Center drawer interaction type description box
- Mobile-specific breakpoints (existing responsive behaviour is preserved)
