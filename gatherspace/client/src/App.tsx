// client/src/App.tsx
// High-fidelity Spatial Virtual Office with LiveKit Audio/Video Proximity Engine,
// Reaction Bubbles, Instant Teleport Navigation, Interactive Stations, and MiniMap Warp.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasView } from './components/CanvasView';
import { MiniMap } from './components/MiniMap';
import { WhiteboardModal } from './components/WhiteboardModal';
import { ArcadeModal } from './components/ArcadeModal';
import { useLiveKit } from './hooks/useLiveKit';
import { PlayerState, Direction, ServerMessage, ClientMessage } from './types';
import mapData from './mapData.json';
import { soundFX } from './utils/audio';

const AVATAR_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
  '#f97316', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'
];

const HAIR_STYLES = [
  { id: 'short', name: 'Short Cut' },
  { id: 'curls', name: 'Curly Afro' },
  { id: 'blonde', name: 'Golden Wave' },
  { id: 'bun', name: 'Top Knot' }
];

const STATUS_PRESETS = [
  { id: 'available', label: '🟢 Available', color: '#10b981' },
  { id: 'focus', label: '🎧 Deep Focus', color: '#8b5cf6' },
  { id: 'break', label: '☕ On Break', color: '#f59e0b' },
  { id: 'meeting', label: '🤝 In Meeting', color: '#3b82f6' },
];

export function normalizeRoomId(raw: string | null | undefined): string {
  if (!raw) return 'office-1';
  const clean = raw.trim().toLowerCase().replace(/^#+/, '').replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  return clean || 'office-1';
}

function getWebSocketUrls(targetRoom: string): string[] {
  const isHttps = window.location.protocol === 'https:';
  const wsProto = isHttps ? 'wss:' : 'ws:';
  const host = window.location.host;
  const hostname = window.location.hostname;
  const roomParam = encodeURIComponent(targetRoom);

  const urls: string[] = [];

  if (import.meta.env.VITE_WS_URL) {
    const base = import.meta.env.VITE_WS_URL;
    urls.push(base.includes('?') ? `${base}&room=${roomParam}` : `${base}?room=${roomParam}`);
  }

  // If running with Vite dev server proxy
  if (window.location.port === '5173') {
    urls.push(`${wsProto}//${host}/ws?room=${roomParam}`);
  }

  // Direct connection to signaling server on port 8080
  urls.push(`${wsProto}//${hostname}:8080?room=${roomParam}`);
  urls.push(`${wsProto}//${hostname}:8080`);

  return Array.from(new Set(urls));
}

const ROOM_PRESETS = [
  { id: 'office-1', label: '🏢 Main HQ' },
  { id: 'all-hands', label: '📢 All-Hands' },
  { id: 'alpha-pod', label: '🚀 Alpha Pod' },
  { id: 'coffee-lounge', label: '☕ Coffee Lounge' },
];

function zoneLabelFor(zoneId: string | null): string {
  if (!zoneId) return 'Main Hallway';
  const zone = mapData.zones.find((z) => z.id === zoneId);
  return zone ? zone.label : 'Office Space';
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  scope: 'spatial' | 'global';
  text: string;
  timestamp: number;
}

type Phase = 'join' | 'connecting' | 'playing';

// ── Join Modal ────────────────────────────────────────────────────────────────
interface JoinModalProps {
  initialRoomId: string;
  onJoin: (name: string, color: string, roomId: string) => void;
}

const JoinModal: React.FC<JoinModalProps> = ({ initialRoomId, onJoin }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [roomInput, setRoomInput] = useState(initialRoomId || 'office-1');
  const [copied, setCopied] = useState(false);

  const activeRoom = normalizeRoomId(roomInput);

  // Sync URL query when room input changes
  const handleRoomChange = (val: string) => {
    setRoomInput(val);
    const clean = normalizeRoomId(val);
    const params = new URLSearchParams(window.location.search);
    params.set('room', clean);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  };

  const handleRandomRoom = () => {
    const r = 'space-' + Math.random().toString(36).substring(2, 7);
    handleRoomChange(r);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${activeRoom}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    soundFX.emotePop();
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onJoin(trimmedName, color, activeRoom);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Join GatherSpace">
      <div className="modal-card" style={{ maxWidth: 460 }}>
        <div className="modal-logo">
          <div className="modal-logo-icon">
            <i className="fas fa-building text-sky-400"></i>
          </div>
          <span className="modal-logo-text">GatherSpace HQ</span>
        </div>

        <p className="modal-subtitle">
          2D Spatial Virtual Office & Team Hub — Proximity Video, Audio & Collaboration
        </p>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Room / Space Selector */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="form-label" htmlFor="room-name" style={{ margin: 0 }}>
                Office Space / Room ID
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleRandomRoom}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 11,
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                  title="Generate Random Space ID"
                >
                  🎲 Random
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                    border: copied ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 11,
                    color: copied ? '#34d399' : '#38bdf8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Copy Direct Link to this Space"
                >
                  <i className={`fas ${copied ? 'fa-check' : 'fa-link'}`}></i>
                  <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#38bdf8',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                #
              </span>
              <input
                id="room-name"
                type="text"
                className="form-input"
                style={{ paddingLeft: 28 }}
                placeholder="e.g. office-1 or marketing-sync"
                value={roomInput}
                onChange={(e) => handleRoomChange(e.target.value)}
                maxLength={32}
                required
              />
            </div>

            {/* Room Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {ROOM_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleRoomChange(p.id)}
                  style={{
                    background: activeRoom === p.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                    border: activeRoom === p.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: activeRoom === p.id ? '#38bdf8' : '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="player-name">Your Display Name</label>
            <input
              id="player-name"
              type="text"
              className="form-input"
              placeholder="e.g. Alex (Engineering)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Choose Avatar Color</label>
            <div className="color-swatches">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${color === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="avatar-preview-container">
            <div className="avatar-preview-label">Live Avatar Preview</div>
            <div className="avatar-preview-stage">
              <div className="avatar-token" style={{ backgroundColor: color }}>
                {name ? name.charAt(0).toUpperCase() : '?'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="avatar-preview-name">{name || 'Your Name'}</span>
                <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>Joining #{activeRoom}</span>
              </div>
            </div>
          </div>

          <button type="submit" className="btn-join" disabled={!name.trim() || !activeRoom}>
            <span>Enter Virtual Office (#{activeRoom})</span>
            <i className="fas fa-arrow-right"></i>
          </button>
        </form>
      </div>
    </div>
  );
};

// ── Main App Component ────────────────────────────────────────────────────────
export const App: React.FC = () => {
  const [roomId, setRoomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return normalizeRoomId(params.get('room'));
  });
  const [phase, setPhase] = useState<Phase>('join');
  const [selfId, setSelfId] = useState('');
  const [liveKitUrl, setLiveKitUrl] = useState<string | null>(null);
  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [spaceSwitcherOpen, setSpaceSwitcherOpen] = useState(false);
  const [switchRoomInput, setSwitchRoomInput] = useState('');

  const [localPlayer, setLocalPlayer] = useState<PlayerState>({
    id: '',
    name: '',
    color: AVATAR_COLORS[0],
    hairColor: '#1e293b',
    x: 420,
    y: 420,
    dir: 'down',
    isMoving: false,
    zoneId: 'lobby',
  });

  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'people' | 'avatar'>('chat');
  const [chatScope, setChatScope] = useState<'spatial' | 'global'>('spatial');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copyToast, setCopyToast] = useState(false);
  const [zoneToast, setZoneToast] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState(STATUS_PRESETS[0].label);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [teleportMenuOpen, setTeleportMenuOpen] = useState(false);

  // Camera Zoom Level (0.75x to 1.45x)
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Interactive Station Modals
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const [coffeeOpen, setCoffeeOpen] = useState(false);
  const [podiumOpen, setPodiumOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [coffeeCount, setCoffeeCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string>('');
  const localPlayerRef = useRef<PlayerState>(localPlayer);
  localPlayerRef.current = localPlayer;
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextUnlocked = useRef(false);

  // Normalize URL query parameter so copying always includes ?room=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room') !== roomId) {
      params.set('room', roomId);
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
  }, [roomId]);

  // LiveKit hook
  const {
    isMicOn,
    isCamOn,
    isScreenOn,
    isSpeaking,
    localStream,
    proximityPeers,
    toggleMic,
    toggleCam,
    toggleScreen,
  } = useLiveKit({
    url: liveKitUrl,
    token: liveKitToken,
    selfId: selfId || null,
    players,
    localPlayer: phase === 'playing' ? localPlayer : null,
  });

  // Attach local stream to video element when cam is active
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = isCamOn ? localStream : null;
    }
  }, [localStream, isCamOn]);

  const handleJoin = (name: string, color: string, chosenRoom: string) => {
    const cleanRoom = normalizeRoomId(chosenRoom);
    setRoomId(cleanRoom);
    setLocalPlayer((prev) => ({ ...prev, name, color }));
    setPhase('connecting');

    if (!audioContextUnlocked.current) {
      soundFX.enabled = soundEnabled;
      soundFX.emotePop();
      audioContextUnlocked.current = true;
    }
  };

  const handleSwitchRoom = (newRoom: string) => {
    const clean = normalizeRoomId(newRoom);
    if (!clean || clean === roomId) {
      setSpaceSwitcherOpen(false);
      return;
    }
    setRoomId(clean);
    setPlayers({});
    setMessages([]);
    setSpaceSwitcherOpen(false);
    setPhase('connecting');
    soundFX.zoneChime();
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundFX.enabled = next;
    if (next) soundFX.emotePop();
  };

  // Connect WebSocket when entered space and keep connection active
  useEffect(() => {
    if (phase === 'join') return;

    let activeWs: WebSocket | null = null;
    let cancelled = false;
    const candidateUrls = getWebSocketUrls(roomId);
    let candidateIndex = 0;

    const connectCandidate = () => {
      if (cancelled) return;
      const url = candidateUrls[candidateIndex];
      console.log(`[GatherSpace] Connecting to signaling server (${candidateIndex + 1}/${candidateUrls.length}): ${url}`);

      const ws = new WebSocket(url);
      activeWs = ws;
      wsRef.current = ws;

      let connected = false;

      ws.onopen = () => {
        connected = true;
        console.log(`[GatherSpace] WebSocket connected successfully to ${url}`);
        const current = localPlayerRef.current;
        const joinMsg: ClientMessage = {
          type: 'JOIN',
          payload: {
            roomId,
            name: current.name,
            color: current.color,
            hairColor: current.hairColor,
          },
        };
        ws.send(JSON.stringify(joinMsg));
      };

      ws.onerror = (err) => {
        console.warn(`[GatherSpace] WebSocket error on ${url}:`, err);
      };

      ws.onclose = () => {
        if (!connected && !cancelled && candidateIndex + 1 < candidateUrls.length) {
          candidateIndex++;
          console.log(`[GatherSpace] Retrying with candidate ${candidateIndex + 1}/${candidateUrls.length}: ${candidateUrls[candidateIndex]}...`);
          setTimeout(connectCandidate, 250);
        }
      };

      ws.onmessage = (evt) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'INIT_STATE': {
            selfIdRef.current = msg.payload.selfId;
            setSelfId(msg.payload.selfId);
            setLiveKitToken(msg.payload.liveKitToken || null);
            setLiveKitUrl(msg.payload.liveKitUrl || null);

            const spawnInfo = msg.payload.players?.[msg.payload.selfId];
            if (spawnInfo) {
              setLocalPlayer((prev) => ({
                ...prev,
                id: msg.payload.selfId,
                x: spawnInfo.x,
                y: spawnInfo.y,
                dir: spawnInfo.dir,
                zoneId: spawnInfo.zoneId,
              }));
            } else {
              setLocalPlayer((prev) => ({ ...prev, id: msg.payload.selfId }));
            }

            const remoteMap: Record<string, PlayerState> = {};
            Object.values(msg.payload.players || {}).forEach((p) => {
              if (p.id !== msg.payload.selfId) remoteMap[p.id] = p;
            });
            setPlayers(remoteMap);
            setPhase('playing');
            break;
          }

          case 'PLAYER_JOINED': {
            if (msg.payload && msg.payload.id !== selfIdRef.current) {
              setPlayers((prev) => ({ ...prev, [msg.payload.id]: msg.payload }));
              soundFX.proximityConnect();
            }
            break;
          }

          case 'PLAYER_LEFT': {
            if (msg.payload && msg.payload.id) {
              const leftId = msg.payload.id;
              setPlayers((prev) => {
                const updated = { ...prev };
                delete updated[leftId];
                return updated;
              });
            }
            break;
          }

          case 'PLAYER_MOVED': {
            if (msg.payload && msg.payload.id !== selfIdRef.current) {
              const p = msg.payload;
              setPlayers((prev) => {
                const existing = prev[p.id];
                if (!existing) {
                  return {
                    ...prev,
                    [p.id]: {
                      id: p.id,
                      name: 'Colleague',
                      color: '#6366f1',
                      hairColor: '#1e293b',
                      x: p.x,
                      y: p.y,
                      dir: p.dir,
                      isMoving: p.isMoving,
                      zoneId: p.zoneId,
                    },
                  };
                }
                return {
                  ...prev,
                  [p.id]: {
                    ...existing,
                    x: p.x,
                    y: p.y,
                    dir: p.dir,
                    isMoving: p.isMoving,
                    zoneId: p.zoneId,
                  },
                };
              });
            }
            break;
          }

          case 'CHAT_BROADCAST': {
            if (msg.payload) {
              const incoming: ChatMessage = {
                id: Math.random().toString(),
                senderId: msg.payload.senderId,
                senderName: msg.payload.senderName,
                scope: msg.payload.scope,
                text: msg.payload.text,
                timestamp: msg.payload.timestamp || Date.now(),
              };
              setMessages((prev) => [...prev, incoming]);

              const isEmoji = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}){1,3}$/u.test(incoming.text.trim());
              if (isEmoji) {
                soundFX.emotePop();
                window.dispatchEvent(
                  new CustomEvent('gatherspace:reaction', {
                    detail: { playerId: incoming.senderId, emoji: incoming.text.trim() },
                  })
                );
              } else {
                soundFX.chatPing();
                window.dispatchEvent(
                  new CustomEvent('gatherspace:speech', {
                    detail: { playerId: incoming.senderId, text: incoming.text },
                  })
                );
              }

              setUnreadCount((c) => c + 1);
            }
            break;
          }
        }
      };
    };

    connectCandidate();

    return () => {
      cancelled = true;
      if (activeWs) {
        activeWs.close();
      }
    };
  }, [phase === 'join', roomId]);

  // Handle local movement
  const handleLocalMove = useCallback(
    (pos: { x: number; y: number; dir: Direction; isMoving: boolean; zoneId: string | null }) => {
      setLocalPlayer((prev) => {
        if (prev.zoneId !== pos.zoneId) {
          const zoneName = zoneLabelFor(pos.zoneId);
          setZoneToast(zoneName);
          setTimeout(() => setZoneToast(null), 3500);
        }
        return {
          ...prev,
          x: pos.x,
          y: pos.y,
          dir: pos.dir,
          isMoving: pos.isMoving,
          zoneId: pos.zoneId,
        };
      });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const moveMsg: ClientMessage = {
          type: 'MOVE',
          payload: {
            x: pos.x,
            y: pos.y,
            dir: pos.dir,
            isMoving: pos.isMoving,
            zoneId: pos.zoneId,
          },
        };
        wsRef.current.send(JSON.stringify(moveMsg));
      }
    },
    []
  );

  // Teleport to Colleague
  const handleTeleportToPlayer = (target: PlayerState) => {
    soundFX.teleportWarp();
    const targetX = target.x - 45;
    const targetY = target.y;
    const zoneId = target.zoneId;

    setLocalPlayer((prev) => ({
      ...prev,
      x: targetX,
      y: targetY,
      zoneId,
    }));

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'MOVE',
          payload: {
            x: targetX,
            y: targetY,
            dir: 'right',
            isMoving: false,
            zoneId,
          },
        })
      );
    }

    triggerReaction('⚡');
    setZoneToast(`Warped to ${target.name} in ${zoneLabelFor(zoneId)}`);
    setTimeout(() => setZoneToast(null), 3000);
  };

  // Teleport to Specific Zone / Coordinates
  const handleTeleportToCoords = (x: number, y: number, label?: string) => {
    soundFX.teleportWarp();
    const zone = mapData.zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    const zoneId = zone ? zone.id : null;

    setLocalPlayer((prev) => ({
      ...prev,
      x,
      y,
      zoneId,
    }));

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'MOVE',
          payload: {
            x,
            y,
            dir: 'down',
            isMoving: false,
            zoneId,
          },
        })
      );
    }

    triggerReaction('⚡');
    setZoneToast(`Warped to ${label || zoneLabelFor(zoneId)}`);
    setTimeout(() => setZoneToast(null), 3000);
    setTeleportMenuOpen(false);
  };

  // Trigger interactable station modal
  const handleTriggerInteract = (actionKey: string) => {
    if (actionKey === 'whiteboard' || actionKey === 'whiteboard_item') {
      setWhiteboardOpen(true);
      soundFX.zoneChime();
    } else if (actionKey === 'coffee' || actionKey === 'coffee_bar') {
      setCoffeeOpen(true);
      soundFX.coffeeBrew();
    } else if (actionKey === 'podium' || actionKey === 'podium_stand') {
      setPodiumOpen(true);
      soundFX.podiumChime();
    } else if (actionKey === 'arcade') {
      setArcadeOpen(true);
      soundFX.emotePop();
    }
  };

  // Send Chat Message
  const sendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    const newMsg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      senderId: selfId,
      senderName: localPlayer.name,
      scope: chatScope,
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setChatInput('');

    const isEmoji = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}){1,3}$/u.test(text);
    if (isEmoji) {
      soundFX.emotePop();
      window.dispatchEvent(
        new CustomEvent('gatherspace:reaction', {
          detail: { playerId: selfId, emoji: text },
        })
      );
    } else {
      soundFX.chatPing();
      window.dispatchEvent(
        new CustomEvent('gatherspace:speech', {
          detail: { playerId: selfId, text },
        })
      );
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const chatMsg: ClientMessage = {
        type: 'CHAT',
        payload: {
          scope: chatScope,
          text,
        },
      };
      wsRef.current.send(JSON.stringify(chatMsg));
    }
  };

  // Trigger Floating Reaction Bubble
  const triggerReaction = (emoji: string) => {
    soundFX.emotePop();
    window.dispatchEvent(
      new CustomEvent('gatherspace:reaction', {
        detail: { playerId: selfId, emoji },
      })
    );

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const chatMsg: ClientMessage = {
        type: 'CHAT',
        payload: {
          scope: 'spatial',
          text: emoji,
        },
      };
      wsRef.current.send(JSON.stringify(chatMsg));
    }
  };

  const handleCopyInvite = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopyToast(true);
    soundFX.emotePop();
    setTimeout(() => setCopyToast(false), 3000);
  };

  if (phase === 'join') {
    return <JoinModal initialRoomId={roomId} onJoin={handleJoin} />;
  }

  if (phase === 'connecting') {
    return (
      <div className="connecting-overlay">
        <div className="spinner" />
        <span className="connecting-text">Entering #{roomId}…</span>
      </div>
    );
  }

  const allPlayers = selfId ? { ...players, [selfId]: { ...localPlayer, id: selfId } } : players;
  const onlineCount = Object.keys(allPlayers).length;
  const activeProximityList = Object.values(proximityPeers).filter((p) => p.canSee);

  return (
    <div className="game-wrapper" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#020617' }}>
      {/* ── 2D Spatial Canvas ────────────────────────────────────────── */}
      <CanvasView
        localPlayer={localPlayer}
        players={allPlayers}
        selfId={selfId}
        zoom={zoomLevel}
        onMove={handleLocalMove}
        onTriggerInteract={handleTriggerInteract}
      />

      {/* ── TOP-LEFT: Space Identity, Space Switcher & Status Pill ───── */}
      <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderRadius: 9999 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #0284c7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
            <i className="fas fa-building"></i>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>GatherSpace HQ</span>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#94a3b8' }}>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>#{roomId}</span>
              <span>•</span>
              <span>{zoneLabelFor(localPlayer.zoneId)}</span>
              <span>•</span>
              <span>{onlineCount} {onlineCount === 1 ? 'Colleague' : 'Colleagues'}</span>
            </div>
          </div>

          {/* Switch Space Button */}
          <button
            onClick={() => {
              setSwitchRoomInput(roomId);
              setSpaceSwitcherOpen(true);
            }}
            title="Switch or Create Office Space"
            style={{ padding: '6px 10px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 9999, color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s ease' }}
          >
            <i className="fas fa-door-open"></i> Space
          </button>

          <button
            onClick={handleCopyInvite}
            title="Copy Direct Invite Link"
            style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9999, color: '#cbd5e1', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease' }}
          >
            <i className="fas fa-link"></i> Invite
          </button>
        </div>

        {/* Quick-Teleport Room Selector */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setTeleportMenuOpen(!teleportMenuOpen)}
            className="glass-card"
            style={{ padding: '8px 14px', borderRadius: 9999, border: '1px solid rgba(56, 189, 248, 0.4)', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i className="fas fa-bolt"></i>
            <span>Warp Room</span>
            <i className="fas fa-chevron-down" style={{ fontSize: 9 }}></i>
          </button>

          {teleportMenuOpen && (
            <div
              className="glass-card"
              style={{ position: 'absolute', top: 44, left: 0, width: 220, borderRadius: 16, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 60, boxShadow: '0 15px 35px rgba(0,0,0,0.8)' }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', padding: '4px 8px' }}>
                Instant Room Teleport
              </div>
              {mapData.zones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => handleTeleportToCoords(z.x + z.w / 2, z.y + z.h / 2, z.label)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: 'none',
                    background: localPlayer.zoneId === z.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                    color: localPlayer.zoneId === z.id ? '#38bdf8' : '#f8fafc',
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{z.label}</span>
                  <i className="fas fa-arrow-right" style={{ fontSize: 10, opacity: 0.6 }}></i>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Custom Status Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setStatusMenuOpen(!statusMenuOpen)}
            className="glass-card"
            style={{ padding: '8px 14px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>{userStatus}</span>
            <i className="fas fa-chevron-down" style={{ fontSize: 9 }}></i>
          </button>

          {statusMenuOpen && (
            <div
              className="glass-card"
              style={{ position: 'absolute', top: 44, left: 0, width: 160, borderRadius: 14, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 50 }}
            >
              {STATUS_PRESETS.map((st) => (
                <button
                  key={st.id}
                  onClick={() => {
                    setUserStatus(st.label);
                    setStatusMenuOpen(false);
                  }}
                  style={{ padding: '8px 10px', borderRadius: 8, border: 'none', background: userStatus === st.label ? 'rgba(255,255,255,0.1)' : 'transparent', color: '#f8fafc', fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer' }}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── TOP-CENTER: Real-Time Proximity Video & Audio Grid ────────── */}
      <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', gap: 10, maxWidth: '65vw', overflowX: 'auto', paddingBottom: 4 }}>
        {/* Local Video Card */}
        <div
          className="glass-card"
          style={{
            position: 'relative',
            width: 140,
            height: 90,
            borderRadius: 18,
            overflow: 'hidden',
            border: isSpeaking ? '2px solid #22c55e' : isMicOn ? '2px solid rgba(56, 189, 248, 0.7)' : '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: isSpeaking ? '0 0 20px rgba(34, 197, 94, 0.5)' : isMicOn ? '0 0 15px rgba(56, 189, 248, 0.3)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#090d16',
            flexShrink: 0,
          }}
        >
          {isCamOn && localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: localPlayer.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15 }}>
              {localPlayer.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 4, left: 6, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: 6, backdropFilter: 'blur(4px)' }}>
            <i className={`fas ${isMicOn ? 'fa-microphone text-emerald-400' : 'fa-microphone-slash text-rose-400'}`} style={{ fontSize: 9 }}></i>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#f8fafc' }}>You</span>
          </div>

          <div style={{ position: 'absolute', top: 4, right: 6, background: 'rgba(56, 189, 248, 0.25)', color: '#38bdf8', padding: '1px 5px', borderRadius: 4, fontSize: 8, fontWeight: 800 }}>
            LOCAL
          </div>
        </div>

        {/* Proximity Connected Peers */}
        {activeProximityList.map((p) => {
          const remoteP = players[p.id];
          return (
            <div
              key={p.id}
              onClick={() => remoteP && handleTeleportToPlayer(remoteP)}
              className="glass-card"
              title={`Click to Warp to ${p.name}`}
              style={{
                position: 'relative',
                width: 140,
                height: 90,
                borderRadius: 18,
                overflow: 'hidden',
                border: p.gain > 0.8 ? '2px solid rgba(16, 185, 129, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#090d16',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'transform 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15 }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: '#f8fafc', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </div>

              <div style={{ position: 'absolute', bottom: 4, left: 6, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: 6, backdropFilter: 'blur(4px)' }}>
                <i className="fas fa-volume-up text-emerald-400" style={{ fontSize: 9 }}></i>
                <span style={{ fontSize: 9, fontWeight: 600, color: '#a7f3d0' }}>
                  {Math.round(p.gain * 100)}%
                </span>
              </div>

              <div style={{ position: 'absolute', top: 4, right: 6, background: p.inSameRoom ? 'rgba(99, 102, 241, 0.3)' : 'rgba(16, 185, 129, 0.3)', color: p.inSameRoom ? '#a5b4fc' : '#34d399', padding: '1px 5px', borderRadius: 4, fontSize: 8, fontWeight: 800 }}>
                {p.inSameRoom ? 'ROOM' : `${(p.distance / 20).toFixed(1)}m`}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── TOP-RIGHT: Spatial MiniMap with Click-to-Teleport ────────── */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 40, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
        <MiniMap
          players={allPlayers}
          selfId={selfId}
          localPlayer={localPlayer}
          onTeleport={handleTeleportToCoords}
        />

        {/* Dynamic Zoom Pill */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 9999 }}>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))))}
            title="Zoom Out"
            style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
          >
            <i className="fas fa-minus"></i>
          </button>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', minWidth: 38, textAlign: 'center' }}>
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(1.45, Number((z + 0.15).toFixed(2))))}
            title="Zoom In"
            style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
          >
            <i className="fas fa-plus"></i>
          </button>
          <button
            onClick={() => setZoomLevel(1.0)}
            title="Reset Zoom"
            style={{ padding: '2px 8px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#94a3b8', fontSize: 10, cursor: 'pointer' }}
          >
            1x
          </button>
        </div>
      </div>

      {/* ── ZONE ENTRANCE TOAST BANNER ───────────────────────────────── */}
      {zoneToast && (
        <div
          style={{
            position: 'fixed',
            top: 116,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            padding: '8px 22px',
            borderRadius: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
            animation: 'fadeInDown 0.3s ease',
          }}
        >
          <i className="fas fa-bolt text-sky-400"></i>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>
            {zoneToast}
          </span>
        </div>
      )}

      {/* ── BOTTOM-CENTER: Floating Action Dock ──────────────────────── */}
      <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 9999, border: '1px solid rgba(255, 255, 255, 0.15)' }}>
          {/* Mic */}
          <button
            onClick={toggleMic}
            title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: 'none',
              background: isMicOn ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: isMicOn ? '#34d399' : '#f87171',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              transition: 'all 0.2s ease',
            }}
          >
            <i className={`fas ${isMicOn ? 'fa-microphone' : 'fa-microphone-slash'}`}></i>
          </button>

          {/* Cam */}
          <button
            onClick={toggleCam}
            title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: 'none',
              background: isCamOn ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              color: isCamOn ? '#34d399' : '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              transition: 'all 0.2s ease',
            }}
          >
            <i className={`fas ${isCamOn ? 'fa-video' : 'fa-video-slash'}`}></i>
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreen}
            title={isScreenOn ? 'Stop Sharing' : 'Share Screen'}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: 'none',
              background: isScreenOn ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.08)',
              color: isScreenOn ? '#38bdf8' : '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              transition: 'all 0.2s ease',
            }}
          >
            <i className="fas fa-desktop"></i>
          </button>

          {/* Sound FX Mute/Unmute */}
          <button
            onClick={handleToggleSound}
            title={soundEnabled ? 'Mute Sound FX' : 'Enable Sound FX'}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: 'none',
              background: soundEnabled ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              color: soundEnabled ? '#a5b4fc' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            <i className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'}`}></i>
          </button>

          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

          {/* Reaction Emote Bubbles */}
          {['👋', '👏', '❤️', '🙌', '😂', '☕', '🚀', '🔥', '⚡', '🎉'].map((em) => (
            <button
              key={em}
              onClick={() => triggerReaction(em)}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255,255,255,0.06)',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {em}
            </button>
          ))}

          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

          {/* Station Launchers */}
          <button
            onClick={() => setWhiteboardOpen(true)}
            title="Open Whiteboard Station"
            style={{
              padding: '8px 14px',
              borderRadius: 9999,
              border: '1px solid rgba(56, 189, 248, 0.4)',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <i className="fas fa-chalkboard"></i> Board
          </button>

          <button
            onClick={() => setArcadeOpen(true)}
            title="Play Retro Arcade"
            style={{
              padding: '8px 14px',
              borderRadius: 9999,
              border: '1px solid rgba(16, 185, 129, 0.4)',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <i className="fas fa-gamepad"></i> Arcade
          </button>

          <button
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard Shortcuts"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
            }}
          >
            <i className="fas fa-keyboard"></i>
          </button>
        </div>

        {/* Side Drawer Toggle */}
        <button
          onClick={() => {
            setPanelOpen(!panelOpen);
            setUnreadCount(0);
          }}
          style={{
            position: 'relative',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: panelOpen ? '#0284c7' : '#6366f1',
            border: 'none',
            color: '#fff',
            fontSize: 18,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 25px rgba(99, 102, 241, 0.4)',
            transition: 'all 0.2s ease',
          }}
        >
          <i className={`fas ${panelOpen ? 'fa-times' : 'fa-comment-dots'}`}></i>
          {!panelOpen && unreadCount > 0 && (
            <span style={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0f172a' }}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ── SLIDE-OUT DRAWER PANEL (Chat, People Directory & Warp, Avatar) ── */}
      <div
        className="glass-card"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          bottom: 16,
          width: 360,
          zIndex: 50,
          borderRadius: 24,
          display: panelOpen ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Drawer Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', padding: 6 }}>
          {[
            { id: 'chat', icon: 'fa-comments', label: 'Chat' },
            { id: 'people', icon: 'fa-users', label: `People (${onlineCount})` },
            { id: 'avatar', icon: 'fa-user-astronaut', label: 'Avatar' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'chat' | 'people' | 'avatar')}
              style={{
                flex: 1,
                padding: '10px 0',
                border: 'none',
                background: activeTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                borderRadius: 12,
                color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <i className={`fas ${tab.icon}`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
          <button
            onClick={() => setPanelOpen(false)}
            style={{ width: 36, height: 36, borderRadius: 10, background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* Tab 1: Chat */}
        {activeTab === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', padding: 10, gap: 6, background: 'rgba(0,0,0,0.2)' }}>
              <button
                onClick={() => setChatScope('spatial')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: chatScope === 'spatial' ? '#6366f1' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Nearby (Proximity)
              </button>
              <button
                onClick={() => setChatScope('global')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: chatScope === 'global' ? '#6366f1' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Global (Office-Wide)
              </button>
            </div>

            {/* Message List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                  <i className="fas fa-paper-plane" style={{ fontSize: 24, marginBottom: 8, display: 'block', opacity: 0.5 }}></i>
                  No messages yet. Say hello to colleagues nearby!
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: m.senderId === selfId ? '#38bdf8' : '#a5b4fc' }}>
                        {m.senderName}
                      </span>
                      <span style={{ fontSize: 9, color: '#64748b' }}>
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: m.scope === 'spatial' ? 'rgba(99,102,241,0.2)' : 'rgba(56,189,248,0.2)', color: m.scope === 'spatial' ? '#a5b4fc' : '#38bdf8' }}>
                        {m.scope}
                      </span>
                    </div>
                    <div style={{ background: m.senderId === selfId ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: 10, fontSize: 12, color: '#f8fafc', wordBreak: 'break-word', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {m.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={sendChat} style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, background: 'rgba(0,0,0,0.3)' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Message in ${chatScope === 'spatial' ? 'proximity' : 'global office'}...`}
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '10px 14px', color: '#fff', fontSize: 12, outline: 'none' }}
              />
              <button
                type="submit"
                style={{ width: 40, height: 40, borderRadius: 12, background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <i className="fas fa-paper-plane"></i>
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: People Directory & Instant Warp */}
        {activeTab === 'people' && (
          <div style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
              Active Colleagues ({onlineCount})
            </div>
            {Object.values(allPlayers).map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 10,
                  borderRadius: 14,
                  background: p.id === selfId ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name} {p.id === selfId && <span style={{ color: '#38bdf8' }}>(You)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {zoneLabelFor(p.zoneId)}
                    </div>
                  </div>
                </div>

                {p.id !== selfId && (
                  <button
                    onClick={() => handleTeleportToPlayer(p)}
                    title={`Teleport directly to ${p.name}`}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <i className="fas fa-bolt text-sky-400"></i> Go
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Avatar Customizer */}
        {activeTab === 'avatar' && (
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 8 }}>Avatar Color</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setLocalPlayer((prev) => ({ ...prev, color: c }));
                      soundFX.emotePop();
                    }}
                    style={{
                      height: 36,
                      borderRadius: 10,
                      background: c,
                      border: localPlayer.color === c ? '2px solid #fff' : 'none',
                      cursor: 'pointer',
                      boxShadow: localPlayer.color === c ? '0 0 10px ' + c : 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 8 }}>Hairstyle</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {HAIR_STYLES.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setLocalPlayer((prev) => ({ ...prev, hairColor: h.id === 'blonde' ? '#f59e0b' : '#1e293b' }));
                      soundFX.emotePop();
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#f8fafc',
                      fontSize: 12,
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL 1: High-Fidelity Collaborative Whiteboard ───────────── */}
      <WhiteboardModal
        isOpen={whiteboardOpen}
        onClose={() => setWhiteboardOpen(false)}
        userName={localPlayer.name}
      />

      {/* ── MODAL 2: Retro Cyber Arcade Mini-Game ─────────────────────── */}
      <ArcadeModal
        isOpen={arcadeOpen}
        onClose={() => setArcadeOpen(false)}
      />

      {/* ── MODAL 3: Coffee & Chai Break Lounge ───────────────────────── */}
      {coffeeOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5, 8, 16, 0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 440, borderRadius: 24, padding: 24, textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.4)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
              ☕
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Office Chai & Espresso Bar</h3>
            <p style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 18 }}>Take a sprint breather! Brewing grants a +30% walking speed energy boost.</p>
            
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: 14, borderRadius: 14, marginBottom: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                <span>Espresso Energy Boost:</span>
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{coffeeCount} cups brewed</span>
              </div>
              <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, coffeeCount * 25)}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #eab308)', transition: 'width 0.3s ease' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  setCoffeeCount((c) => c + 1);
                  triggerReaction('☕');
                  soundFX.coffeeBrew();
                }}
                style={{ flex: 1, padding: '12px 0', background: 'linear-gradient(135deg, #d97706, #b45309)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 16px rgba(217, 119, 6, 0.3)' }}
              >
                Brew Espresso (+Boost)
              </button>
              <button
                onClick={() => setCoffeeOpen(false)}
                style={{ padding: '12px 18px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#cbd5e1', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: Townhall Stage Podium ────────────────────────────── */}
      {podiumOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5, 8, 16, 0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 440, borderRadius: 24, padding: 24, textAlign: 'center', border: '1px solid rgba(192, 132, 252, 0.4)' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(192, 132, 252, 0.2)', border: '1px solid rgba(192, 132, 252, 0.4)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
              📢
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Auditorium Main Stage Podium</h3>
            <p style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 18 }}>You have stepped onto the speaker's podium. Broadcast mode is enabled across the space!</p>
            
            <div style={{ padding: 14, background: 'rgba(74, 4, 78, 0.4)', border: '1px solid rgba(192, 132, 252, 0.4)', borderRadius: 14, textAlign: 'left', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f3e8ff', marginBottom: 2 }}>
                <i className="fas fa-bullhorn"></i> Global Broadcast Active
              </div>
              <p style={{ fontSize: 11, color: '#e9d5ff', margin: 0, opacity: 0.85 }}>All proximity distance filters are bypassed while occupying this stage.</p>
            </div>

            <button
              onClick={() => {
                setPodiumOpen(false);
                soundFX.podiumChime();
              }}
              style={{ width: '100%', padding: '12px 0', background: 'linear-gradient(135deg, #9333ea, #7e22ce)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Continue Presenting
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL 5: Keyboard Shortcuts & Help ────────────────────────── */}
      {shortcutsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5, 8, 16, 0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 440, borderRadius: 24, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-keyboard text-sky-400"></i>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShortcutsOpen(false)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
              {[
                { key: 'W / A / S / D or Arrows', desc: 'Navigate your avatar around the office' },
                { key: 'E or Space', desc: 'Interact with Whiteboard, Coffee Bar, Podium, Arcade' },
                { key: 'Click anywhere', desc: 'Click-to-move pathfinding directly to target location' },
                { key: '+ / -', desc: 'Zoom camera in / out for close-up conversation or overview' },
              ].map((sc, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                  <span style={{ fontWeight: 700, color: '#38bdf8' }}>{sc.key}</span>
                  <span style={{ color: '#cbd5e1' }}>{sc.desc}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShortcutsOpen(false)}
              style={{ width: '100%', marginTop: 18, padding: '10px 0', background: '#0284c7', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL 6: Office Space Switcher & Room Creator ───────────── */}
      {spaceSwitcherOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5, 8, 16, 0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 460, borderRadius: 24, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                  <i className="fas fa-door-open"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>Switch Office Space</h3>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Currently in <strong className="text-sky-400">#{roomId}</strong> ({onlineCount} colleagues)</span>
                </div>
              </div>
              <button onClick={() => setSpaceSwitcherOpen(false)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>

            <p style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 16 }}>
              Jump to another team's virtual office space or create a dedicated private meeting space:
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSwitchRoom(switchRoomInput);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#38bdf8', fontWeight: 700, fontSize: 14 }}>#</span>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: 28 }}
                  placeholder="e.g. all-hands or sprint-planning"
                  value={switchRoomInput}
                  onChange={(e) => setSwitchRoomInput(e.target.value)}
                  maxLength={32}
                  autoFocus
                  required
                />
              </div>

              {/* Space Presets */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ROOM_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSwitchRoomInput(p.id)}
                    style={{
                      background: switchRoomInput === p.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                      border: switchRoomInput === p.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: switchRoomInput === p.id ? '#38bdf8' : '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={!switchRoomInput.trim()}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    background: 'linear-gradient(135deg, #0284c7, #6366f1)',
                    border: 'none',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Join #{normalizeRoomId(switchRoomInput)}
                </button>
                <button
                  type="button"
                  onClick={() => setSpaceSwitcherOpen(false)}
                  style={{
                    padding: '12px 18px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 12,
                    color: '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Toast */}
      {copyToast && (
        <div style={{ position: 'fixed', top: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(52, 211, 153, 0.5)', padding: '8px 16px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#6ee7b7', boxShadow: '0 12px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fas fa-check-circle text-emerald-400"></i> Space invite link copied to clipboard!
        </div>
      )}
    </div>
  );
};

export default App;
