// server/src/server.ts
// Owner: Agent 1 (Backend & Signaling). See AGENTS.md §3.
//
// Responsibilities (and ONLY these — see AGENTS.md "out of scope"):
//   - Hold in-memory room state (no database).
//   - Relay JOIN / MOVE / CHAT between clients in the same room.
//   - Issue a LiveKit access token on JOIN.

import { WebSocketServer, WebSocket } from 'ws';
import { AccessToken } from 'livekit-server-sdk';
import * as dotenv from 'dotenv';
import { ClientMessage, ServerMessage, PlayerState } from './types';

dotenv.config();

const PORT = parseInt(process.env.PORT || '8080', 10);
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://your-project.livekit.cloud';

interface Session {
  ws: WebSocket;
  playerId: string;
  roomId: string;
}

// In-memory only, by design (see docs/PRODUCT_SPEC.md §5).
const rooms = new Map<string, Map<string, PlayerState>>();
const sessions = new Map<WebSocket, Session>();

const HOST = process.env.HOST || '0.0.0.0';
const wss = new WebSocketServer({ port: PORT, host: HOST });

function isLiveKitConfigured(): boolean {
  if (!LIVEKIT_URL || LIVEKIT_URL.includes('your-project.livekit.cloud')) return false;
  if (!LIVEKIT_API_KEY || LIVEKIT_API_KEY === 'devkey') return false;
  if (!LIVEKIT_API_SECRET || LIVEKIT_API_SECRET === 'secret' || LIVEKIT_API_SECRET.includes('•') || LIVEKIT_API_SECRET.length < 10) return false;
  return true;
}

async function createLiveKitToken(
  roomId: string,
  participantIdentity: string,
  participantName: string
): Promise<string | null> {
  if (!isLiveKitConfigured()) {
    return null;
  }
  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: participantName,
      ttl: '6h',
    });
    at.addGrant({ roomJoin: true, room: roomId, canPublish: true, canSubscribe: true });
    return await at.toJwt();
  } catch (err) {
    console.error('[LiveKit] Token creation error:', err);
    return null;
  }
}

function broadcastToRoom(roomId: string, msg: ServerMessage, excludeWs?: WebSocket) {
  const payload = JSON.stringify(msg);
  sessions.forEach((session, ws) => {
    if (session.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

wss.on('connection', (ws: WebSocket) => {
  const playerId = 'usr_' + Math.random().toString(36).substring(2, 9);

  ws.on('message', async (raw: string) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      console.error('Invalid JSON from client:', err);
      return;
    }

    if (msg.type === 'JOIN') {
      const rawRoomId = msg.payload.roomId || 'office-1';
      const roomId = rawRoomId.trim().toLowerCase().replace(/^#/, '') || 'office-1';
      const { name, color, hairColor } = msg.payload;

      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      const roomPlayers = rooms.get(roomId)!;

      const initialPlayer: PlayerState = {
        id: playerId,
        name,
        color,
        hairColor,
        x: 420 + (Math.random() * 50 - 25),
        y: 420 + (Math.random() * 50 - 25),
        dir: 'down',
        isMoving: false,
        zoneId: 'lobby',
      };

      roomPlayers.set(playerId, initialPlayer);
      sessions.set(ws, { ws, playerId, roomId });
      console.log(`[Room ${roomId}] Player joined: ${name} (${playerId}), Total in room: ${roomPlayers.size}`);

      const liveKitToken = await createLiveKitToken(roomId, playerId, name);

      const playersObject: Record<string, PlayerState> = {};
      roomPlayers.forEach((val, key) => (playersObject[key] = val));

      const effectiveLiveKitUrl = isLiveKitConfigured() ? LIVEKIT_URL : null;

      ws.send(
        JSON.stringify({
          type: 'INIT_STATE',
          payload: { selfId: playerId, liveKitToken, liveKitUrl: effectiveLiveKitUrl, players: playersObject },
        } as ServerMessage)
      );

      broadcastToRoom(roomId, { type: 'PLAYER_JOINED', payload: initialPlayer }, ws);
      return;
    }

    if (msg.type === 'MOVE') {
      const session = sessions.get(ws);
      if (!session) return;
      const roomPlayers = rooms.get(session.roomId);
      const player = roomPlayers?.get(session.playerId);
      if (!player) return;

      player.x = msg.payload.x;
      player.y = msg.payload.y;
      player.dir = msg.payload.dir;
      player.isMoving = msg.payload.isMoving;
      player.zoneId = msg.payload.zoneId;

      broadcastToRoom(
        session.roomId,
        { type: 'PLAYER_MOVED', payload: { id: session.playerId, ...msg.payload } },
        ws
      );
      return;
    }

    if (msg.type === 'CHAT') {
      const session = sessions.get(ws);
      if (!session) return;
      const player = rooms.get(session.roomId)?.get(session.playerId);
      if (!player) return;

      broadcastToRoom(
        session.roomId,
        {
          type: 'CHAT_BROADCAST',
          payload: {
            senderId: session.playerId,
            senderName: player.name,
            scope: msg.payload.scope,
            text: msg.payload.text,
            timestamp: Date.now(),
          },
        },
        ws
      );
      return;
    }
  });

  ws.on('close', () => {
    const session = sessions.get(ws);
    if (!session) return;
    const { roomId, playerId } = session;
    const roomPlayers = rooms.get(roomId);
    if (roomPlayers) {
      roomPlayers.delete(playerId);
      if (roomPlayers.size === 0) rooms.delete(roomId);
    }
    sessions.delete(ws);
    broadcastToRoom(roomId, { type: 'PLAYER_LEFT', payload: { id: playerId } });
  });
});

console.log(`GatherSpace signaling server running on port ${PORT}`);
