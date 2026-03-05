# Game Flow Hub (Current + Change Tracking)

## How To Use This Hub
- This file is the engineering reference for current game flow and future flow-related changes.
- Add each future change to the Active Change Register before implementation starts.
- After implementation, update the same change entry with shipped behavior and validation details.
- Keep this file aligned with runtime code in `app/api`, `lib/store-runtime.ts`, `lib/store-supabase.ts`, `lib/store.ts`, `lib/resolver.ts`, `lib/scoring.ts`, and `lib/validation.ts`.

## Current Flow (Source of Truth)
### Session creation and facilitator token
- Facilitator creates a session via `POST /api/sessions`.
- Response includes `session` and a one-time `facilitator_token`.
- Token is stored client-side and required in `x-facilitator-token` for facilitator-only actions.
- New sessions start as `waiting`, with `current_round_number = 1`, and all rounds pre-created as `pending`.

### Player join and identity
- Players join via `POST /api/sessions/{sessionRef}/join` with a nickname.
- Join creates one `player` (`role: player`) and one `company` for that player.
- Company name defaults to `{nickname} Ventures`.
- Market share is rebalanced across all companies in the session when players join.
- Duplicate nicknames in the same session are rejected.
- Session code and player identifiers are used by the player dashboard to bind actions.
- Player dashboard auto-restores cached player identity when available from local storage.

### Session statuses
- `waiting`: session exists but has not started.
- `running`: session is active.
- `paused`: facilitator has paused the session.
- `completed`: all rounds are finished.

### Round phases
- `pending`: round exists but has not opened.
- `decision`: main decision submission phase.
- `interaction`: interaction proposals/responses phase (decisions are still accepted).
- `resolved`: round has been resolved and scored.

### Dashboard hierarchy and message center
- Player and facilitator dashboards use the same top-down hierarchy:
  - Hero row (status badges + message center button).
  - Priority row (prominent round snapshot + breaking news panel).
  - Analytics rows (company value card, value charts, leaderboard, comparison chart).
- Player identity is no longer a primary visible section; identity recovery lives in Message Center disclosure controls.
- Player message center opens as a right slide-over with tabs: `Inbox`, `Outbox`, `Compose`.
- Facilitator message center opens as a right slide-over with monitor-only tabs: `All`, `Pending`, `Accepted`, `Rejected/Expired`.
- Player decision, interaction, and proposal response actions remain phase/status guarded with lock reasons.

### Manual facilitator controls
- `start`: moves first round (`round 1`) from `pending` to `decision`, sets session to `running`.
- `pause`: session `running -> paused`.
- `resume`: session `paused -> running`.
- `advance_to_interaction`: current round `decision -> interaction`.
- `resolve` (`POST /api/facilitator/{sessionRef}/round/resolve`): resolves current round and advances or completes session.

### Round resolution mechanics
- Resolution is server-authoritative.
- Event assignment: facilitator-injected event is used when present; otherwise a deterministic deck event is drawn from `seed + round_number`.
- Decisions: submitted decisions are used per company; missing decisions fall back to resolver defaults.
- Interactions: only `accepted` proposals apply effects; non-accepted proposals do not affect metrics.
- Scoring: balanced scorecard is computed after updated metrics, and score snapshots are stored for the round.
- Performance history: one `company_metric_snapshots` row per company is written each resolved round (`metrics` + `total_score`).
- Timeline: one timeline entry is appended per resolved round with event, decisions, interactions, and leaderboard.
- Advancement: non-final rounds increment `current_round_number` and open next round in `decision`; final round marks session `completed`.

## State Machines
```mermaid
flowchart TD
  W["Session: waiting"] -->|start| R["Session: running"]
  R -->|pause| P["Session: paused"]
  P -->|resume| R
  R -->|final round resolved| C["Session: completed"]
  P -->|round resolved (non-final)| R

  RP["Round: pending"] -->|session start or prior round resolve| RD["Round: decision"]
  RD -->|advance_to_interaction| RI["Round: interaction"]
  RD -->|resolve| RR["Round: resolved"]
  RI -->|resolve| RR
```

## End-to-End Lifecycle
1. Facilitator creates session (`POST /api/sessions`) and receives session code plus facilitator token.
2. Students join with session code and nickname (`POST /api/sessions/{sessionRef}/join`).
3. Facilitator starts session (`POST /api/facilitator/{sessionRef}/control` with `start`).
4. Current round opens in `decision`; players submit decisions (`POST /api/rounds/{roundId}/decisions`).
5. Facilitator may open interaction phase (`advance_to_interaction`) or resolve directly.
6. Players create interaction proposals (`POST /api/interactions/proposals`) and targets respond (`POST /api/interactions/{proposalId}/respond`).
7. Facilitator may inject one ad-hoc event for the session (`POST /api/facilitator/{sessionRef}/event`) before resolution.
8. Facilitator resolves round (`POST /api/facilitator/{sessionRef}/round/resolve`):
   - Event finalized (facilitator-injected or deck-drawn).
   - Resolver applies event + decisions + accepted interactions.
   - Metrics are clamped to bounds.
   - Leaderboard and score snapshots are produced.
   - Timeline entry is recorded.
9. If more rounds remain, session advances to next round and opens `decision`; otherwise status becomes `completed`.
10. Facilitator/players view ongoing state (`GET /api/sessions/{sessionRef}/state`), results/timeline/performance series (`GET /api/sessions/{sessionRef}/results`), and message feed (`GET /api/sessions/{sessionRef}/messages`).

Current constraints:
- No automatic timer-based phase transitions; facilitator drives phase changes.
- Only one facilitator ad-hoc event is allowed per session.
- Pending interaction proposals are marked `expired` only during round resolve when `expires_at <= now`.

## API and Guardrail Reference
| Endpoint | Actor | Auth Needed | Valid Status/Phase | Key Failure Cases | Rate-Limit Scope |
| --- | --- | --- | --- | --- | --- |
| `POST /api/sessions` | Facilitator | None | N/A (create) | Invalid payload | `session-create` |
| `POST /api/sessions/{sessionRef}/join` | Player | None | Session not `completed` | Session not found, nickname taken, invalid payload | `session-join` (+ session key suffix) |
| `GET /api/sessions/{sessionRef}/state` | Facilitator/Player | None | Any | Session not found | None |
| `POST /api/rounds/{roundId}/decisions` | Player | None | Session `running` or `paused`; Round `decision` or `interaction` | Session inactive, invalid phase, bad player/round, invalid payload | `round-decision` (+ round key suffix) |
| `POST /api/interactions/proposals` | Player | None | Session `running` or `paused`; Round `decision` or `interaction` | Same target/proposer, invalid company/session/round, invalid payload | `interaction-proposal` |
| `POST /api/interactions/{proposalId}/respond` | Player (target company only) | None | Proposal must be `pending` | Not target company, proposal not found/pending, invalid payload | `interaction-respond` (+ proposal key suffix) |
| `POST /api/facilitator/{sessionRef}/control` | Facilitator | `x-facilitator-token` | Depends on action and current session/round state | Missing/invalid token, invalid action, cannot start with zero players | `facilitator-control` (+ session/token prefix) |
| `POST /api/facilitator/{sessionRef}/event` | Facilitator | `x-facilitator-token` | Current round not `resolved` | Missing/invalid token, facilitator event already used in session, event already assigned for round, invalid payload | `facilitator-event` (+ session/token prefix) |
| `POST /api/facilitator/{sessionRef}/round/resolve` | Facilitator | `x-facilitator-token` | Session started and not completed; current round not resolved | Missing/invalid token, session not started/completed, round already resolved | `facilitator-resolve` (+ session/token prefix) |
| `GET /api/sessions/{sessionRef}/messages` | Facilitator/Player | Facilitator token for unscoped feed; without token `company_id` is required | Any (session must exist) | Missing `company_id` without token, invalid token, invalid filters/limit, session/company not found | `message-feed` (+ session/company/token scope) |
| `GET /api/sessions/{sessionRef}/results` | Facilitator/Player | None | Any (session must exist) | Session not found | None |

## Active Change Register
| ID | Title | Status | Why | Scope | Impacted Files | Acceptance Criteria | Linked Plan/Issue | Date Added | Last Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GF-001` | Create living game flow hub | `Done` | Establish single source of truth for flow + future updates | `Flow` | `docs/game-flow.md` | File contains required sections, state diagram, API table, register, log, and update checklist | This plan (chat request on 2026-03-05) | 2026-03-05 | 2026-03-05 |
| `GF-002` | Guided player dashboard flow | `Done` | Reduce player confusion with natural in-UI progression and action feedback | `UI, Flow` | `components/player-dashboard.tsx`, `app/globals.css`, `tests/unit/resolver.test.ts`, `docs/game-flow.md` | Guided steps visible, locked-action reasons shown, round submission state shown, recap blocks added, tests/build pass | Player UX improvement request (chat request on 2026-03-05) | 2026-03-05 | 2026-03-05 |
| `GF-003` | Visual hierarchy + analytics + message center overhaul | `Done` | Improve decision clarity, elevate key round context, and add richer cross-round insight/message workflows | `UI, API, Data, Flow` | `components/player-dashboard.tsx`, `components/facilitator-dashboard.tsx`, `components/ui/*`, `components/charts/*`, `app/globals.css`, `app/api/sessions/[sessionRef]/messages/route.ts`, `lib/store-runtime.ts`, `lib/store.ts`, `lib/store-supabase.ts`, `lib/types.ts`, `lib/validation.ts`, `supabase/schema.sql`, `supabase/migrations/20260305170500_company_metric_snapshots.sql`, `tests/unit/store-flow.test.ts`, `docs/game-flow.md` | New message endpoint and feed auth behavior shipped; performance snapshots persisted and exposed as results `performance_series`; player/facilitator hierarchy redesign shipped; charts and drawer flows functional; tests/build/playwright validation complete | Visual hierarchy + analytics + message center plan (chat request on 2026-03-05) | 2026-03-05 | 2026-03-05 |

## Change Log (Dated)
### 2026-03-05
- **Change ID:** `GF-001`
- **What changed:** Added `docs/game-flow.md` as a living hub for current flow plus change tracking.
- **Behavior impact:** No runtime behavior change (documentation only).
- **Validation/tests run:** Ran `npm test -- tests/unit/store-flow.test.ts tests/unit/resolver.test.ts` (store-flow passed; resolver determinism test currently fails due differing `updated_at` timestamps across runs). Also cross-checked endpoint and guardrail details with API route handlers and `lib/facilitator-guard.ts`, `lib/rate-limit.ts`, `lib/validation.ts`.
- **Follow-ups:** Add new `GF-xxx` entries before any future flow/API/UI/infra/data change affecting game flow.

### 2026-03-05
- **Change ID:** `GF-002`
- **What changed:** Reworked player dashboard into guided steps with phase-aware guidance, lock reasons, submission-state indicators, and round recap blocks.
- **Behavior impact:** Player-facing UX now provides a natural flow and clearer action affordances without changing core API contracts.
- **Validation/tests run:** `npm test` (5 files, 8 tests), `npm run build`, and Playwright skill loop screenshots/state validation in `output/web-game/player-guide` and `output/web-game/player-guide-running` (no error artifact files generated).
- **Follow-ups:** Consider server-authoritative per-player decision status in session state to replace local-only submission markers.

### 2026-03-05
- **Change ID:** `GF-003`
- **What changed:** Added session message feed endpoint (`GET /api/sessions/{sessionRef}/messages`), added `company_metric_snapshots` persistence and `performance_series` in results, and redesigned both dashboards around round snapshot + breaking news + analytics hierarchy with a right-side message center drawer.
- **Behavior impact:** Gameplay rules are unchanged, but player/facilitator UI flow is now hierarchy-first with charted value history, session-wide message monitoring, and compose/inbox/outbox message workflows for players.
- **Validation/tests run:** `npm test`; `npm run build`; `supabase db push --linked` (applied migration `20260305170500_company_metric_snapshots.sql`); manual API checks for message auth/filter behavior; Playwright skill loop artifacts reviewed for waiting/decision/interaction/post-resolve in `output/web-game/visual-overhaul/*`.
- **Follow-ups:** Consider wrapping round resolve writes in a DB transaction/RPC to avoid partial updates if downstream writes fail after phase updates.

## Update Checklist (Before/After Changes)
Before implementing a change:
- [ ] Add or update an entry in Active Change Register with status `Planned` or `In Progress`.
- [ ] Define acceptance criteria for the change.
- [ ] List impacted files.
- [ ] Link the plan/issue reference.

After implementing a change:
- [ ] Update "Current Flow" sections if behavior changed.
- [ ] Update "API and Guardrail Reference" if contracts/rules changed.
- [ ] Set Active Change Register status to `Done` (or `Cancelled` with reason).
- [ ] Add dated Change Log entry with validation/tests and follow-ups.

## Maintenance Rules
- Keep current-flow sections aligned with actual code, not intended future behavior.
- If planned behavior differs from current behavior, record it in Active Change Register and Change Log until shipped.
- Use stable change IDs in the format `GF-001`, `GF-002`, and so on.
- Never delete completed history; append new log entries and update statuses in place.
