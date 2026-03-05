# Hosting Options for Pilot and Beyond

## Option A (Recommended MVP)
- Frontend/API: Vercel Hobby (Next.js app)
- Database + realtime + auth: Supabase Free
- Cost target: $0/month for pilot usage
- Tradeoff: cold starts and free-tier quotas

## Option B
- Frontend: Cloudflare Pages
- Backend/runtime: Cloudflare Workers + Durable Objects
- Data: D1
- Cost target: usually free at pilot scale
- Tradeoff: higher engineering complexity

## Option C
- Self-hosted Docker on university/own server
- App: Next.js standalone container
- Data: managed or local Postgres
- Reverse proxy: Caddy or Nginx
- Tradeoff: highest operational overhead, highest control

## Production Readiness Checklist
- Persist game state in Postgres (replace in-memory store)
- Add facilitator auth and role checks
- Add request throttling on session/join/interaction endpoints
- Add backups and retention for session results
- Add observability (errors, latency, resolve failures)
