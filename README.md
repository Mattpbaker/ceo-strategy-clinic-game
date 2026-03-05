# CEO Strategy Clinic Game MVP

Browser-based, turn-based multiplayer strategy simulation for entrepreneurship cohorts. Students run companies in a shared world, respond to economic/social/political events, and use cooperative + competitive interactions.

## Stack
- Next.js 15 + TypeScript
- In-memory server-authoritative game engine (MVP local mode)
- Zod validation
- Vitest tests

## Quick Start
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase Linking (Now Enabled)
This project now supports a Supabase-backed runtime store for all API routes.  
If the required env vars are present, APIs use Supabase. Otherwise they fall back to the in-memory store.

### Required env vars
Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
UPSTASH_REDIS_REST_URL=https://<upstash-id>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<upstash-rest-token>
```

### Link + push schema
```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --linked
```

## Core API Endpoints
- `POST /api/sessions` - create session
- `POST /api/sessions/{code}/join` - join with nickname
- `GET /api/sessions/{sessionId|code}/state` - world/session state
- `POST /api/rounds/{roundId}/decisions` - submit decision
- `POST /api/interactions/proposals` - propose interaction
- `POST /api/interactions/{proposalId}/respond` - accept/reject/counter
- `POST /api/facilitator/{sessionId|code}/event` - inject ad-hoc event
- `POST /api/facilitator/{sessionId|code}/control` - start/pause/resume/open interaction phase
- `POST /api/facilitator/{sessionId|code}/round/resolve` - force resolve
- `GET /api/sessions/{sessionId|code}/results` - leaderboard + timeline

## Facilitator Auth
- `POST /api/sessions` now returns `facilitator_token` once at creation time.
- Facilitator-only actions require header:
  - `x-facilitator-token: <facilitator_token>`

## Included MVP Features
- Session code join flow
- 7-metric company model
- 6-round loop
- Deterministic seeded resolver
- Event deck + one facilitator-injected event per session
- Cooperative interactions: trade contract, joint venture
- Competitive interactions: price war, talent poach, reputation challenge
- Balanced scorecard ranking
- Facilitator and player dashboards
- Supabase Realtime session updates for facilitator/player dashboards (polling removed)
- Distributed API rate limiting via Upstash Redis on write endpoints (with in-memory fallback if Redis env vars are not set)
- `window.render_game_to_text` + `window.advanceTime` hooks for automation

## Notes
- The app includes both:
  - In-memory store (`lib/store.ts`) for local fallback/tests.
  - Supabase store (`lib/store-supabase.ts`) for persistent multiplayer sessions.
- Schema source: [`supabase/schema.sql`](supabase/schema.sql) and migration in `supabase/migrations/`.

## Tests
```bash
npm test
```

Covers score math, deterministic resolution behavior, and core session flow.
