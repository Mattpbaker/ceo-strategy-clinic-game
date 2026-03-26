# Game UX Improvements — Design Spec

**Date:** 2026-03-26
**Status:** Approved

## Problem

From a player's perspective, the game's objective and mechanics are opaque:
- Budget sliders and focus actions have no explanation of what they do or how they affect metrics
- After a round resolves, players see new metric values but don't know why they changed
- Interaction types (Trade contract, Price war, etc.) have no description of their mechanical effect
- The current round phase (Decision / Interaction / Resolved) is only shown as a small badge in the hero; players often don't know what action they should be taking
- Facilitators must manually fill in every field when injecting a custom event, which is slow and error-prone mid-session

## Solution Overview

Four targeted frontend-only improvements. No backend API changes required.

---

## Feature 1: Investment Clarity — Describe + Debrief

### Part A: Field descriptions in the decision form

Every input in the "Strategy Decision" card gets a short description shown as always-visible helper text directly below it. Static, always rendered — no interaction needed to reveal it.

**Budget categories** (`budget.growth`, `budget.people`, `budget.resilience`, `budget.brand`, `budget.compliance`):

| Field | Description |
|---|---|
| Growth | Drives revenue growth and market share. Pairs well with Expand Market focus. High growth + Aggressive posture = more upside, more volatility. |
| People | Builds talent morale and operational resilience through your workforce. Reduces attrition risk and improves efficiency multipliers. |
| Resilience | Strengthens operational systems against shocks. Reduces the negative impact of high-severity events on your metrics. |
| Brand | Improves brand reputation and can offset regulatory risk. High-visibility focus actions amplify brand budget returns. |
| Compliance | Reduces regulatory risk exposure. Important when political events are likely. Conservative posture amplifies compliance returns. |

**Focus actions:**

| Action | Description |
|---|---|
| Expand Market | Amplifies market share and revenue gains this round. Boosts effectiveness of Growth budget. |
| Improve Efficiency | Reduces cost drag and improves resilience. Amplifies People and Resilience budget returns. |
| Invest in People | Directly improves talent morale and reduces attrition effects. Amplifies People budget. |
| Risk Mitigation | Reduces event shock impact this round. Pairs well with high Resilience and Compliance budgets. |
| Brand Campaign | Improves brand reputation and market share perception. Amplifies Brand budget returns. |

**Risk posture:**

| Posture | Description |
|---|---|
| Conservative | Lower upside but protected downside. Event shocks have reduced impact. Good when a high-severity event is likely. |
| Balanced | Moderate exposure in both directions. Default starting point for most rounds. |
| Aggressive | Higher potential gains but amplified losses. Best when the event is expected to be favourable or low-severity. |

**Implementation:** These descriptions live in a new `lib/game-descriptions.ts` file as typed constant objects. The decision form in `components/player-dashboard.tsx` renders the relevant description as a `.small` paragraph below each field when a value is selected.

### Part C: Post-round metric delta card

After each round resolves (`roundPhase === "resolved"`), a new "Round Outcome" card appears in the player dashboard between the priority grid and the analytics section.

**Display:** For each of the 7 company metrics, show:
- Metric name
- Previous round value → Current round value
- Net delta (colour-coded: green if positive, orange if negative, muted if zero)
- The active round event is shown as a header above the delta table so players can contextualise the changes

**Data source:** `mySeries` (the `CompanyPerformanceSeries` for the current player) already contains per-round metric values. Delta is computed client-side by comparing the current round's point to the previous round's point. No backend changes needed.

**Implementation:** New inline section within `components/player-dashboard.tsx`, rendered conditionally when `roundPhase === "resolved"` and `mySeries?.points.length >= 2`.

---

## Feature 2: Round Stage Visibility — Stepper + Banner

### Phase stepper (in hero)

Replaces the existing `<span className="badge">Phase: {formatPhase(roundPhase)}</span>` in the hero with a connected stepper showing all four phases in sequence.

**Phases:** Pending → Decision → Interaction → Resolved

**Visual states per step:**
- Past phase: green background, checkmark prefix (`✓`)
- Current phase: gold background, bold, dot prefix (`●`)
- Future phase: muted/dark background, plain text

The stepper is a small inline flex element that fits within the existing `.hero-tools` layout alongside the session status and realtime badges.

### Phase banner (between hero and priority grid)

A new `PhaseBanner` component rendered as a strip between `<section className="hero">` and `<section className="priority-grid">` in both the player and facilitator dashboards.

**Banner content by phase and role:**

| Phase | Player banner | Facilitator banner |
|---|---|---|
| pending | "Waiting for facilitator to start the session." | "Start the session when players are ready." |
| decision | "DECISION PHASE — Set your budget, focus action, and risk posture below." + decisions-submitted counter | "DECISION PHASE — {n}/{total} decisions submitted." |
| interaction | "INTERACTION PHASE — Open Intel Center to propose and respond to deals before the facilitator resolves." | "INTERACTION PHASE — Review proposals in Intel Center. Advance when ready." |
| resolved | "ROUND RESOLVED — Review your metric outcomes below." | "ROUND RESOLVED — Advance to the next round when the debrief is complete." |
| session complete | "Simulation complete. Review your final standing below." | "Session complete. Walk through the timeline and leaderboard with your cohort." |

The banner uses the existing War Room CSS variables and matches the phase colour coding (gold for decision, orange for interaction, green for resolved).

**Implementation:**
- New file: `components/ui/phase-banner.tsx`
- Props: `phase`, `sessionStatus`, `role: "player" | "facilitator"`, `decisionsSubmitted?`, `totalPlayers?`
- Inserted in `player-dashboard.tsx` and `facilitator-dashboard.tsx` between the hero section and the priority grid

---

## Feature 3: Interaction Clarity — Type description box

When a player selects an interaction type in the proposal form (inside the Message Center drawer), a description box appears immediately below the type `<select>`.

**Interaction type descriptions:**

| Type | Class | Who benefits | Description | Intensity controls |
|---|---|---|---|---|
| Trade Contract | Cooperative | Both | A supply or distribution agreement. Both companies gain market share and revenue growth. Lower risk than a joint venture. | Scale of mutual benefit |
| Joint Venture | Cooperative | Both | Pool resources for a shared project. Both gain market share and revenue. Risk from the next event shock is shared between you. | Payout scale for both |
| Price War | Competitive | You (at cost to both) | Undercut your target's pricing. You gain their market share but both companies take a cash hit. | Aggression — higher = more market gained, more cash lost |
| Talent Poach | Competitive | You | Recruit from your target's team. You gain talent morale; they lose it. Their operational resilience takes a secondary hit. | Disruption level |
| Reputation Challenge | Competitive | You | Publicly challenge a competitor's standing. You gain brand reputation; they lose it. | Signal strength |

The description box is a styled `<div>` with a cyan border for cooperative types and an orange border for competitive types, rendered conditionally based on `interactionType` state. It sits below the `<select>` and above the Intensity input.

**Implementation:** `INTERACTION_DESCRIPTIONS` constant in `lib/game-descriptions.ts`. Rendered inline in the interaction proposal form section of `components/player-dashboard.tsx`.

---

## Feature 4: Preset Events — Library Panel

A browseable preset library replaces the blank-slate event form as the primary way for the facilitator to deploy events. The existing form remains, pre-filled when a preset is selected and always editable before submitting.

### Preset data

New file: `lib/event-presets.ts`

```typescript
interface EventPreset {
  id: string;
  label: string;
  category: "economic" | "social" | "political";
  severity: "low" | "medium" | "high";
  title: string;
  narrative: string;
  effects: {
    cash: number;
    revenue_growth: number;
    market_share: number;
    talent_morale: number;
    operational_resilience: number;
    brand_reputation: number;
    regulatory_risk: number;
  };
}
```

**18 presets:**

| ID | Label | Category | Severity | Key effects |
|---|---|---|---|---|
| supply-chain-crisis | Supply Chain Crisis | economic | high | cash −20, resilience −10, growth −5 |
| interest-rate-hike | Interest Rate Hike | economic | medium | cash −10, growth −8 |
| market-crash | Market Crash | economic | high | cash −25, market −15, growth −12 |
| tech-boom | Tech Boom | economic | low | growth +8, market +5 |
| inflation-surge | Inflation Surge | economic | medium | cash −12, morale −5, resilience −5 |
| trade-war | Trade War | economic | high | market −12, cash −10, growth −8 |
| labour-strike | Labour Strike Wave | social | high | morale −15, resilience −8 |
| consumer-boycott | Consumer Boycott | social | medium | brand −12, market −8 |
| viral-pr-crisis | Viral PR Crisis | social | high | brand −18, market −10 |
| talent-shortage | Talent Shortage | social | medium | morale −10, resilience −5 |
| community-award | Community Award | social | low | brand +10, morale +5 |
| regulatory-crackdown | Regulatory Crackdown | political | high | reg_risk +20, cash −8 |
| data-privacy-law | Data Privacy Law | political | medium | reg_risk +12, cash −6, resilience −4 |
| election-uncertainty | Election Uncertainty | political | medium | market −6, growth −4 |
| govt-subsidy | Government Subsidy | political | low | cash +15, growth +5 |
| antitrust-probe | Antitrust Probe | political | high | reg_risk +18, market −8, brand −6 |
| green-regulation | Green Regulation | political | medium | reg_risk +10, resilience −5, brand +4 |
| trade-agreement | Trade Agreement | political | low | market +8, growth +6 |

### UI layout

The "Deploy Event" card in `facilitator-dashboard.tsx` is restructured:

1. **Top section: Preset Library**
   - Category filter tabs: All / Economic / Social / Political
   - Card grid (3 columns): each card shows label, category·severity badge, and key effects summary
   - Colour coding: red border = high severity, gold = medium, cyan = low/positive
   - Clicking a card calls `setEventCategory`, `setEventSeverity`, `setEventTitle`, `setEventNarrative`, `setEventEffects` with the preset values
   - Selected card gets a highlighted border

2. **Bottom section: Event Form** (existing, unchanged except pre-filled)
   - A divider with label "— CUSTOMIZE OR DEPLOY AS-IS —"
   - All existing form fields remain editable
   - "Deploy Event" button unchanged

**Implementation:** `lib/event-presets.ts` for data, state additions in `facilitator-dashboard.tsx` (`selectedPresetId` to track highlighted card), UI restructure of the Deploy Event card.

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `lib/game-descriptions.ts` | Create | Budget, focus action, risk posture, interaction type descriptions |
| `lib/event-presets.ts` | Create | 18 preset event objects |
| `components/ui/phase-banner.tsx` | Create | Phase stepper + contextual banner component |
| `components/player-dashboard.tsx` | Modify | Add phase banner, field descriptions in decision form, interaction description box, post-round delta card |
| `components/facilitator-dashboard.tsx` | Modify | Add phase banner, restructure Deploy Event card with preset library |

---

## Out of Scope

- Live metric projections as sliders move (requires replicating server resolver logic; risk of mismatch with actual results)
- Per-decision attribution in the delta card (e.g. "Growth budget contributed exactly +3.2") — this would require backend instrumentation
- Editable preset library (presets are hardcoded; facilitator can always edit fields before deploying)
- Backend changes of any kind
