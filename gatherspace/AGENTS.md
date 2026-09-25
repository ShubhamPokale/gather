# AGENTS.md — GatherSpace Build Guide

Read this file first, every session, before touching code. It is the shared
source of truth for any agent (Claude, Cursor, Copilot, human) picking up
work on this repo. If something here conflicts with a stray comment in code,
this file wins — fix the code to match it.

## 0. What we're building

GatherSpace: a browser-based 2D spatial virtual office (Gather.town-style).
Anyone with a link joins a top-down office, walks around with WASD/arrows,
and gets automatic proximity-based audio/video with people near them.
Private rooms isolate audio; a podium/stage broadcasts to everyone.

**Tonight's scope is fixed. Do not add anything not listed in "In scope."**
See `docs/PRODUCT_SPEC.md` for the full reasoning; this file just states
what's true.

### In scope (v1 — ship tonight)
- Join via `/?room=<id>`, pick name + avatar color, grant mic/cam. No login.
- Move on a top-down map with WASD/arrows, collide with walls/furniture.
- Real-time position sync over WebSocket (30Hz throttle).
- Spatial audio/video via LiveKit Cloud: proximity falloff in open space,
  strict isolation in private-room zones, full broadcast from the stage.
- Global + spatial text chat with overhead speech bubbles.
- Mini-map, mute/camera toggle, basic control dock.

### Explicitly out of scope (v2+) — do not build these unless asked
- Persistent accounts, login, or saved user profiles.
- A database of any kind. State is in-memory on the Node process.
- Map editor / custom tilemaps.
- Whiteboard sync, screen sharing, chat history persistence.
- Calendar integrations, crypto/NFT anything, 3D/WebXR.

If a task seems to require one of the "out of scope" items, stop and flag it
instead of building around it.

## 1. Stack (locked — do not swap without discussion)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Vite + React + TypeScript, HTML5 Canvas | No Phaser/Three.js |
| Realtime state | Node.js + `ws` | Plain WebSocket, not Socket.io, unless already changed |
| Media (A/V) | LiveKit Cloud (SFU) | Not raw mesh WebRTC — see docs/ARCHITECTURE.md §3 |
| Persistence | None | In-memory `Map` per room. Server restart = clients refresh. |
| Hosting | Vercel/Cloudflare (frontend), Render/Railway (backend) | Git-push deploys |

## 2. Directory map

```
gatherspace/
├── AGENTS.md                 # you are here
├── README.md                 # local dev + deploy quick start
├── docs/
│   ├── PRODUCT_SPEC.md       # PRD, personas, scope rationale
│   ├── DESIGN_SPEC.md        # colors, typography, layout, avatar spec
│   └── ARCHITECTURE.md       # system diagram, proximity algorithm, protocols
├── shared/
│   └── types.ts              # network contract — client & server both import this
├── server/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.ts         # WebSocket state server + LiveKit token issuer
│       └── types.ts          # re-export of shared/types.ts for the server build
└── client/
    ├── package.json
    └── src/
        ├── types.ts          # re-export of shared/types.ts for the client build
        ├── mapData.json       # world geometry, zones, colliders, furniture — SHARED TRUTH
        ├── hooks/
        │   └── useLiveKit.ts  # proximity → volume/subscription logic
        ├── components/
        │   └── CanvasView.tsx # game loop, input, rendering
        └── utils/
            └── math.ts        # collision + distance + zone lookup
```

`shared/types.ts` and `client/src/mapData.json` are the two files every
workstream reads from. Never fork them — if a field is missing, add it there
and update all readers in the same change.

## 3. Workstreams (can run in parallel, own separate files)

**Agent 1 — Backend & signaling** (`server/`)
- WebSocket connection lifecycle, in-memory room map, 30Hz move broadcast.
- LiveKit JWT issuance on `JOIN`.
- Owns: `server/src/server.ts`.

**Agent 2 — Frontend engine & canvas** (`client/src/components`, `client/src/utils`)
- Input handling, AABB collision against `mapData.json`, camera follow,
  avatar rendering, mini-map.
- Owns: `CanvasView.tsx`, `math.ts`, and any new render helpers.

**Agent 3 — Media (LiveKit)** (`client/src/hooks/useLiveKit.ts`)
- Connects to LiveKit, computes per-peer gain/subscription from position +
  zone using the formula in `docs/ARCHITECTURE.md §3.2`.
- Owns: `useLiveKit.ts`.

Cross-cutting rule: if you need to change `shared/types.ts` or
`mapData.json`, say so explicitly in your output and list every file that
now needs a matching update — don't silently drift the other workstreams.

## 4. Environment variables

Server (`server/.env`, see `server/.env.example`):
```
PORT=8080
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Client (`client/.env.production`):
```
VITE_WS_URL=wss://<your-backend-host>
```

Never hardcode these. Never commit a populated `.env`.

## 5. Coding conventions

- TypeScript everywhere; no `any` in `shared/types.ts`.
- Keep the server dependency-free beyond `ws`, `livekit-server-sdk`,
  `dotenv` — no ORM, no framework, unless the scope above changes.
- Client state for remote players lives in a single `Record<string,
  PlayerState>`; don't introduce a second source of truth for positions.
- Proximity/isolation math must match `docs/ARCHITECTURE.md §3.2` exactly —
  if you change the formula, update that doc in the same change.
- No new npm dependency without a one-line justification in your output.

## 6. Definition of done (per workstream)

- Builds with `npm run build` in its own package, no type errors.
- Manually testable against the other two stubs (mock WS messages / mock
  LiveKit room if the other pieces aren't ready yet).
- Matches the message shapes in `shared/types.ts` exactly — no ad-hoc fields.
- Doesn't touch files outside its own ownership list in §3 without saying so.

## 7. Where to look for detail

- Product reasoning, personas, MoSCoW scope: `docs/PRODUCT_SPEC.md`
- Colors, fonts, avatar/zone visuals: `docs/DESIGN_SPEC.md`
- Full architecture, proximity formula, wire protocol, deploy runbook:
  `docs/ARCHITECTURE.md`
