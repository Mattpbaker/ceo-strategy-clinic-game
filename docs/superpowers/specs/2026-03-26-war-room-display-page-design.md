# War Room Display Page

**Date:** 2026-03-26
**Status:** Approved

## Overview

A standalone projector/whiteboard display page (`/display/[code]`) showing live session leaderboard and event feed side by side. Opened by the facilitator from the landing page, designed to stay up on a second screen throughout the session.

## Route & Access

- **URL:** `/display/[code]` (e.g. `/display/ABC123`)
- **Entry point:** New third card on the landing page (`/`) beneath the existing Command Post and Field Deploy cards
- **Auth:** None — session code is sufficient (read-only view, no actions)
- **Data:** Polls `GET /api/sessions/[code]/state` every 5 seconds — no new API endpoints needed

## Landing Page Change

A third card styled with a purple/magenta accent to visually differentiate from facilitator (gold) and player (cyan). Label: "WAR ROOM DISPLAY". Contains a single session code input field and a "Open Display" button that navigates to `/display/[code]`.

## Page Layout

Full-viewport, no nav, no sidebar. War Room dark theme (matches existing globals.css custom properties). Split layout:

- **Left panel — 60% width:** Leaderboard
- **Right panel — 40% width:** Event feed

A thin header bar spans the full width showing the session code, current round, and a live blinking status dot.

## Leaderboard Panel ("COMBAT RANKINGS")

- Sorted by total score descending, updated each poll cycle
- Panel header: "COMBAT RANKINGS" + blinking live dot + "ROUND X / 6"
- Each row:
  - Rank number (top 3 get gold/silver/bronze badge styling)
  - Player/company name
  - Total score as a percentage (0–100)
  - Five dimension score mini-bars: financial, market_position, people, risk_and_robustness, reputation
- Uses `scoreCompanies()` from `lib/scoring.ts` on the companies from session state

## Event Feed Panel ("THREAT INTEL")

- Chronological, newest event at the top
- Panel header: "THREAT INTEL" + blinking live dot
- Each event card:
  - Severity badge: LOW (green) / MED (amber) / HIGH (red)
  - Category tag: ECONOMIC / SOCIAL / POLITICAL (monospace, uppercase)
  - Event title in display font (Rajdhani)
  - Narrative text
  - Metric effects as inline deltas: `CASH −8 · RESILIENCE −6` (positive = green, negative = red)
- Events come from `session_events` in session state (injected by facilitator)

## Styling

- Follows War Room dark theme: `var(--bg)`, `var(--accent)` (gold), `var(--cyan)`, `var(--good)` (green), `var(--bad)` (red)
- Fonts: Rajdhani (display), Share Tech Mono (mono labels), Inter (body)
- Purple/magenta accent for the landing card only: approx `#c084fc` / `rgba(192,132,252,…)`
- Scoped `<style>` block within the page component (consistent with existing pages)
- No Tailwind, no shadcn

## Files to Create/Modify

| File | Change |
|------|--------|
| `app/display/[code]/page.tsx` | New — display page |
| `app/page.tsx` | Add third landing card for display entry |
