# GatherSpace

Browser-based 2D spatial virtual office. Walk around with WASD/arrows, get automatic proximity audio/video with nearby people, and use private rooms for isolated conversations.

## Quick Start (Local Dev)

### Prerequisites
- Node.js 18+
- (Optional) [LiveKit Cloud](https://cloud.livekit.io) free account for real A/V

### 1. Server

```bash
cd server
npm install
# Edit .env with your LiveKit credentials (or leave placeholders to skip A/V)
npm run dev
```

Server runs on `http://localhost:8080`.

### 2. Client

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173/?room=office-1`

### 3. Test with multiple users

Open multiple browser tabs at the same URL. Each tab is an independent player. Walk near each other to trigger proximity audio.

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
