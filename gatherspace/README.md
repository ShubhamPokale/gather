# GatherSpace

Browser-based 2D spatial virtual office. Walk around with WASD/arrows, get automatic proximity audio/video with nearby people, and use private rooms for isolated conversations.

## Quick Start (Local Dev)

### Prerequisites
- Node.js 18+
- (Optional) [LiveKit Cloud](https://cloud.livekit.io) free account for real WebRTC A/V

### 🚀 One-Command Start (Both Server & Client)

From the `gatherspace/` directory:

```bash
npm run dev
```

This concurrently starts:
- **Signaling Server:** `http://localhost:8080` (WebSocket on port 8080)
- **Vite Client:** `http://localhost:5173/?room=office-1` (and across your LAN via `http://<YOUR_IP>:5173/?room=office-1`)

---

### Starting Independently (Optional)

**Terminal 1 (Backend Server):**
```bash
cd server
npm install
npm run dev
```

**Terminal 2 (Frontend Client):**
```bash
cd client
npm install
npm run dev
```

---

### 👥 Sharing Links & Multiplayer Testing

1. Open `http://localhost:5173/?room=office-1` (or click **🎲 Random** in the join screen to create a custom room like `#engineering-pod`).
2. Click the **Invite** button in the top HUD (or copy the URL from your browser).
3. Open the copied link in another browser tab, an Incognito window, or on another computer on the same network.
4. Both users will spawn in the same office space with real-time movement, proximity radar, floating reaction bubbles, spatial audio/video, and interactive whiteboards!

---

## Deploy

### Backend (Render / Railway)

1. Push repo to GitHub.
2. Create a new **Web Service** on [Render](https://render.com), point to `gatherspace/server/`.
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add env vars: `PORT`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`

### Frontend (Vercel)

1. Set `VITE_WS_URL=wss://<your-backend>` in `client/.env.production`
2. From `gatherspace/client/`: `npx vercel --prod`
3. Or connect the GitHub repo in the [Vercel dashboard](https://vercel.com), set root to `gatherspace/client/`.
4. Share `https://<your-app>.vercel.app/?room=office-1`

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system diagram, proximity formula, wire protocol, and deploy runbook.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React + TypeScript + HTML5 Canvas |
| Realtime state | Node.js + `ws` WebSocket |
| Media (A/V) | LiveKit Cloud (SFU) |
| Persistence | None — in-memory only |
