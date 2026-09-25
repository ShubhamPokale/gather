# GatherSpace — Architecture & Protocol Specification

## 1. System diagram

```
                  CLIENT (Vite + React + TS)
   ┌───────────────────────┐   ┌─────────────────────────┐
   │  2D Canvas Loop       │   │  LiveKit Client SDK     │
   │  (input, collision,   │   │  (audio/video tracks,   │
   │   camera, render)     │   │   selective subscribe)  │
   └───────────┬───────────┘   └────────────▲────────────┘
               │ position (30Hz, JSON)      │ WebRTC media
               ▼                            │
   ┌───────────────────────┐   ┌─────────────────────────┐
   │  Node.js state server │   │      LiveKit Cloud       │
   │  (ws) — in-memory     │   │  managed SFU + TURN      │
   │  room map, LiveKit    │   └─────────────────────────┘
   │  token issuer         │
   └───────────────────────┘
```

Two independent transports: the WebSocket carries *position/chat/presence*
only; LiveKit carries *audio/video only*. Never send media over the
WebSocket or positions over LiveKit data channels — keep them separate so
either can be swapped later.

## 2. Component responsibilities

**Frontend (`client/`)**
- Renders the world at 60 FPS via `requestAnimationFrame`.
- Owns local input and collision resolution; the server never validates
  movement in v1 (trusted-client model — acceptable for a same-org tool
  shipping tonight; revisit if abuse becomes a problem).
- Interpolates remote player positions (linear interpolation) between
  network updates.
- Computes proximity/isolation state locally and drives LiveKit
  subscriptions/volume (see §3.2) — the SFU does not need to know about
  spatial logic.

**Backend (`server/`)**
- Single Node process, `ws` for WebSocket, `livekit-server-sdk` for tokens.
- In-memory `Map<roomId, Map<playerId, PlayerState>>`. No database.
- Relays `MOVE` and `CHAT` messages to everyone else in the same room.
- Issues a LiveKit JWT on `JOIN` scoped to that room.

**LiveKit Cloud**
- Handles all WebRTC signaling, NAT traversal (built-in TURN), and media
  routing. The app never talks WebRTC directly.

## 3. Why LiveKit Cloud over mesh WebRTC

| Factor | Mesh WebRTC | LiveKit Cloud (SFU) |
|---|---|---|
| Scaling | O(N²) uplink — breaks down at 6–8 people in one cluster | O(N) — each client uploads once |
| Proximity control | Client-side gain hacks only; bandwidth still wasted on far peers | `setSubscribed(false)` fully stops the far track |
| NAT/firewall | Requires self-hosted STUN/TURN (Coturn/Twilio) | Built-in global TURN relays |
| Setup time | Hours debugging ICE/SDP | Minutes: API key + SDK |

Decision: **LiveKit Cloud**, free tier (5,000 minutes/mo, 100 concurrent
participants, no card required at signup).

### 3.1 Distance & gain formula (open space)

For two players at distance `d`:

```
gain(d) =
  1.0                                    if d <= R_inner (40px)
  (1 - (d - R_inner) / (R_max - R_inner))^2   if R_inner < d <= R_max (140–150px)
  0.0                                    if d > R_max
```

### 3.2 Zone rules (evaluated in this order)

1. **Podium / stage** (`isBroadcast: true` in `mapData.json`): full gain
   (1.0) to everyone on the map, regardless of distance or zone.
2. **Either player in an isolated zone** (`isolatedAudio: true`):
   - Same `zoneId` on both sides → full gain (1.0).
   - Different zones (or one in, one out) → gain 0, video unsubscribed.
3. **Both in open space**: apply the distance formula in §3.1.

Reference implementation lives in `client/src/hooks/useLiveKit.ts`; keep it
in sync with this section if the formula changes.

### 3.3 Video subscription bandwidth tiers

- `d < 80px`: subscribe to full-quality video.
- `80px <= d < 140–150px`: low-bitrate/thumbnail if the SDK supports layer
  selection; otherwise treat same as full quality for v1.
- `d >= 150px` or isolated out of zone: unsubscribe entirely.

## 4. Wire protocol

Canonical types live in `shared/types.ts`. Summary:

**Client → Server**
- `JOIN { roomId, name, color, hairColor }`
- `MOVE { x, y, dir, isMoving, zoneId }`
- `CHAT { scope: 'spatial' | 'global', text }`

**Server → Client**
- `INIT_STATE { selfId, liveKitToken, liveKitUrl, players }`
- `PLAYER_JOINED { ...PlayerState }`
- `PLAYER_MOVED { id, x, y, dir, isMoving, zoneId }`
- `PLAYER_LEFT { id }`
- `CHAT_BROADCAST { senderId, senderName, scope, text, timestamp }`

Position updates are throttled to ~30Hz client-side before sending.

## 5. Map & zone data

`client/src/mapData.json` is the single source of truth for:
- `world`: pixel dimensions of the playable area.
- `spawn`: default entry coordinates.
- `zones`: labeled boxes with `isolatedAudio` and/or `isBroadcast` flags,
  used both for rendering and for the audio logic in §3.2.
- `colliders`: axis-aligned boxes the canvas engine and the (client-side)
  physics both check against.
- `furniture`: decorative + collidable objects.

Both the render layer and the physics layer must read this one file —
never hardcode zone/collision boxes elsewhere.

## 6. Security & privacy notes (v1-appropriate, not enterprise-grade)

- State is ephemeral: nothing survives a server restart by design.
- All media is DTLS-SRTP encrypted (handled by LiveKit).
- Chat text and display names must be escaped before rendering (XSS).
- No auth in v1 — a room ID is the only access control. Don't publish room
  links you don't want strangers joining.
- If a private room needs real access control later, gate it with a
  password/token before issuing that room's LiveKit grant — not built in
  v1.

## 7. Deploy runbook

1. **LiveKit Cloud**: create a free project at cloud.livekit.io, grab
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
2. **Backend**: push to GitHub, deploy `server/` on Render/Railway as a Node
   web service (`npm install` build, `npm start` run), set the three env
   vars above plus `PORT`.
3. **Frontend**: set `VITE_WS_URL` to the deployed backend's `wss://` URL in
   `client/.env.production`, then `npx vercel` (or connect the repo in the
   Vercel dashboard) from `client/`.
4. Share `https://<your-app>.vercel.app/?room=<any-id>` — anyone with the
   link joins that room.
