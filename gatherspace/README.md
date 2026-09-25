# GatherSpace

A browser-based 2D spatial virtual office — walk up to people to talk,
step into private rooms to isolate audio, take the podium to broadcast.

**Start here:** [`AGENTS.md`](./AGENTS.md) — scope, stack, ownership, and
conventions for anyone (human or AI agent) working on this repo.

Full docs:
- [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) — personas, scope, why
- [`docs/DESIGN_SPEC.md`](./docs/DESIGN_SPEC.md) — colors, type, layout
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — diagrams, protocol,
  proximity formula, deploy runbook

## Quick start (local dev)

```bash
# 1. Backend
cd server
cp .env.example .env       # fill in LIVEKIT_URL / KEY / SECRET
npm install
npm run dev                 # runs on :8080

# 2. Frontend (separate terminal)
cd client
echo "VITE_WS_URL=ws://localhost:8080" > .env.local
npm install
npm run dev                 # opens on :5173
```

Open `http://localhost:5173/?room=test-room` in two browser tabs/windows to
see two avatars, movement sync, and proximity audio/video between them.

## Deploy

See `docs/ARCHITECTURE.md §7` — LiveKit Cloud project, Render/Railway for
the backend, Vercel/Cloudflare Pages for the frontend. No database to
provision.

## Status

v1 scope only (see `AGENTS.md §0`). No accounts, no persistence, no map
editor — those are deliberately deferred, not missing by accident.
