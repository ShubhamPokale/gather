// client/src/App.tsx
// Top-level application component with Fullscreen Spatial Office HUD, LiveKit audio/video,
// WebSocket multiplayer synchronization, interactive stations (Whiteboard, Coffee, Podium),
// and sleek slide-out panel (Chat, People, Avatar Customizer).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasView } from './components/CanvasView';
import { MiniMap } from './components/MiniMap';
import { useLiveKit } from './hooks/useLiveKit';
import { PlayerState, Direction, ServerMessage, ClientMessage } from './types';
import mapData from './mapData.json';

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

function getRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'office-1';
}

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
  roomId: string;
  onJoin: (name: string, color: string) => void;
}

const JoinModal: React.FC<JoinModalProps> = ({ roomId, onJoin }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed, color);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Join GatherSpace">
      <div className="modal-card">
        <div className="modal-logo">
          <div className="modal-logo-icon">
            <i className="fas fa-building"></i>
          </div>
          <span className="modal-logo-text">GatherSpace</span>
        </div>

        <p className="modal-subtitle">
          Join virtual workspace <strong style={{ color: 'var(--accent-primary)' }}>#{roomId}</strong>. Choose your name and avatar style to enter.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="join-name">Your Name</label>
            <input
              id="join-name"
              className="form-input"
              type="text"
              placeholder="e.g. Alex Chen"
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Avatar Color</label>
            <div className="color-row" role="radiogroup" aria-label="Avatar color">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  id={`color-${c.replace('#', '')}`}
                  className={`color-swatch${color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <button
            id="join-submit-btn"
            type="submit"
            className="join-btn"
            disabled={!name.trim()}
          >
            Enter Workspace →
          </button>
        </form>
      </div>
    </div>
  );
};

// ── Main Application ──────────────────────────────────────────────────────────
export const App: React.FC = () => {
  const roomId = getRoomId();

  const [phase, setPhase] = useState<Phase>('join');
  const [localPlayer, setLocalPlayer] = useState<PlayerState | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const [selfId, setSelfId] = useState<string | null>(null);

  // LiveKit credentials
  const [lkUrl, setLkUrl] = useState<string | null>(null);
  const [lkToken, setLkToken] = useState<string | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatScope, setChatScope] = useState<'spatial' | 'global'>('spatial');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // UI state
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'people' | 'avatar'>('chat');
  const [zoneBannerText, setZoneBannerText] = useState<string | null>(null);
  const [zoneBannerVisible, setZoneBannerVisible] = useState(false);
  const prevZoneRef = useRef<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);

  // Audio/Video
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [screenShared, setScreenShared] = useState(false);

  // Modals
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [coffeeOpen, setCoffeeOpen] = useState(false);
  const [podiumOpen, setPodiumOpen] = useState(false);
  const [coffeeCount, setCoffeeCount] = useState(0);
  const [copyToast, setCopyToast] = useState(false);

  // Whiteboard drawing state
  const wbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [wbTool, setWbTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [wbColor, setWbColor] = useState('#38bdf8');
  const wbDrawing = useRef(false);
  const wbLast = useRef({ x: 0, y: 0 });

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const moveThrottleRef = useRef<number>(0);

  // LiveKit hook
  const { room: lkRoom } = useLiveKit({
    url: lkUrl,
    token: lkToken,
    selfId,
    players,
    localPlayer,
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Connect WebSocket
  const connectWs = useCallback((playerName: string, playerColor: string) => {
    setPhase('connecting');

    const wsUrl = import.meta.env.VITE_WS_URL
      ? `${import.meta.env.VITE_WS_URL}`
      : `ws://${window.location.hostname}:8080`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const joinMsg: ClientMessage = {
        type: 'JOIN',
        payload: { roomId, name: playerName, color: playerColor, hairColor: playerColor },
      };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (evt) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }

      if (msg.type === 'INIT_STATE') {
        const { selfId: sid, liveKitToken, liveKitUrl, players: initPlayers } = msg.payload;
        setSelfId(sid);
        setLkToken(liveKitToken);
        setLkUrl(liveKitUrl);
        setPlayers(initPlayers);
        setLocalPlayer(initPlayers[sid] ?? null);
        setPhase('playing');
      }

      if (msg.type === 'PLAYER_JOINED') {
        setPlayers((prev) => ({ ...prev, [msg.payload.id]: msg.payload }));
      }

      if (msg.type === 'PLAYER_MOVED') {
        const { id, x, y, dir, isMoving, zoneId } = msg.payload;
        setPlayers((prev) => {
          if (!prev[id]) return prev;
          return { ...prev, [id]: { ...prev[id], x, y, dir, isMoving, zoneId } };
        });
      }

      if (msg.type === 'PLAYER_LEFT') {
        setPlayers((prev) => {
          const next = { ...prev };
          delete next[msg.payload.id];
          return next;
        });
      }

      if (msg.type === 'CHAT_BROADCAST') {
        const p = msg.payload;
        setChatMessages((prev) => [
          ...prev,
          { id: `${p.senderId}-${p.timestamp}`, ...p },
        ]);
        if (!sidePanelOpen) {
          setUnreadCount((c) => c + 1);
        }
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current === ws) connectWs(playerName, playerColor);
      }, 2000);
    };
  }, [roomId, sidePanelOpen]);

  const handleJoin = useCallback((name: string, color: string) => {
    connectWs(name, color);
  }, [connectWs]);

  // Movement handler
  const handleMove = useCallback((pos: { x: number; y: number; dir: Direction; isMoving: boolean; zoneId: string | null }) => {
    const now = performance.now();
    if (now - moveThrottleRef.current < 33) return; // ~30Hz
    moveThrottleRef.current = now;

    setLocalPlayer((prev) => prev ? { ...prev, ...pos } : prev);

    // Zone change detection
    if (pos.zoneId !== prevZoneRef.current) {
      prevZoneRef.current = pos.zoneId;
      if (pos.zoneId) {
        const label = zoneLabelFor(pos.zoneId);
        setZoneBannerText(label);
        setZoneBannerVisible(true);
        setTimeout(() => setZoneBannerVisible(false), 3000);
      } else {
        setZoneBannerVisible(false);
      }
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'MOVE', payload: pos }));
  }, []);

  // Hotkeys & interact triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.code === 'KeyM') toggleMic();
      if (e.code === 'KeyV') toggleCam();
      if (e.code === 'KeyC') setSidePanelOpen((prev) => !prev);
      if (e.code === 'KeyE') {
        if (activePrompt) {
          if (activePrompt.includes('Whiteboard')) setWhiteboardOpen(true);
          else if (activePrompt.includes('Espresso') || activePrompt.includes('Coffee')) setCoffeeOpen(true);
          else if (activePrompt.includes('Stage') || activePrompt.includes('Podium')) setPodiumOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePrompt]);

  // Send chat
  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: 'CHAT', payload: { scope: chatScope, text } }));

    if (selfId && localPlayer) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${selfId}-${Date.now()}`,
          senderId: selfId,
          senderName: localPlayer.name,
          scope: chatScope,
          text,
          timestamp: Date.now(),
        },
      ]);
    }
    setChatInput('');
  }, [chatInput, chatScope, selfId, localPlayer]);

  // Trigger floating emote
  const triggerEmote = (emote: string) => {
    if (!localPlayer) return;
    const emoteDiv = document.createElement('div');
    emoteDiv.className = 'fixed text-3xl z-40 floating-emote pointer-events-none drop-shadow-md';
    emoteDiv.innerText = emote;
    emoteDiv.style.left = '50vw';
    emoteDiv.style.top = '50vh';
    document.body.appendChild(emoteDiv);
    setTimeout(() => emoteDiv.remove(), 1800);
  };

  // Toggle mic/cam via LiveKit
  const toggleMic = useCallback(async () => {
    if (lkRoom) {
      await lkRoom.localParticipant.setMicrophoneEnabled(micMuted);
    }
    setMicMuted((m) => !m);
  }, [lkRoom, micMuted]);

  const toggleCam = useCallback(async () => {
    if (lkRoom) {
      await lkRoom.localParticipant.setCameraEnabled(camOff);
    }
    setCamOff((c) => !c);
  }, [lkRoom, camOff]);

  const copyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2500);
  };

  // Whiteboard drawing handlers
  useEffect(() => {
    if (!whiteboardOpen) return;
    const canvas = wbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.parentElement?.clientWidth || 700;
    canvas.height = canvas.parentElement?.clientHeight || 450;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('🚀 Collaborative System Whiteboard', 36, 50);
  }, [whiteboardOpen]);

  const onWbMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = wbCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    wbDrawing.current = true;
    wbLast.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onWbMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!wbDrawing.current) return;
    const canvas = wbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(wbLast.current.x, wbLast.current.y);
    ctx.lineTo(currX, currY);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (wbTool === 'pen') {
      ctx.strokeStyle = wbColor;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1.0;
    } else if (wbTool === 'highlighter') {
      ctx.strokeStyle = wbColor;
      ctx.lineWidth = 14;
      ctx.globalAlpha = 0.35;
    } else {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 26;
      ctx.globalAlpha = 1.0;
    }
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    wbLast.current = { x: currX, y: currY };
  };

  const onWbMouseUp = () => { wbDrawing.current = false; };

  if (phase === 'join') {
    return <JoinModal roomId={roomId} onJoin={handleJoin} />;
  }

  if (phase === 'connecting') {
    return (
      <div className="connecting-overlay">
        <div className="spinner" />
        <span className="connecting-text">Entering #{roomId}…</span>
      </div>
    );
  }

  const allPlayers = Object.values(players);
  const currentZone = localPlayer ? zoneLabelFor(localPlayer.zoneId) : 'Welcome Lobby';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      
      {/* ── 1. Fullscreen World Canvas ──────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {localPlayer && selfId && (
          <CanvasView
            localPlayer={localPlayer}
            players={players}
            selfId={selfId}
            onMove={handleMove}
            onInteractPrompt={(p) => setActivePrompt(p)}
          />
        )}
      </div>

      {/* ── 2. Top-Left: GatherSpace HQ & Room Status ────────────────── */}
      <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 30, pointerEvents: 'auto' }}>
        <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderRadius: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}>
            <i className="fas fa-building"></i>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>GatherSpace HQ</span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <span style={{ color: '#a5b4fc', fontWeight: 600 }}>{currentZone}</span>
              <span>•</span>
              <span style={{ color: '#34d399', fontFamily: 'monospace', fontWeight: 600 }}>{allPlayers.length} Online</span>
            </div>
          </div>
          <button
            onClick={copyInvite}
            style={{ marginLeft: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
            title="Copy invite link"
          >
            <i className="fas fa-link" style={{ fontSize: 9 }}></i> Invite
          </button>
        </div>
      </div>

      {/* ── 3. Top-Center: Video Tiles Strip ─────────────────────────── */}
      <div
        id="videoBar"
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 30,
          maxWidth: '85vw',
          overflowX: 'auto',
          pointerEvents: 'auto'
        }}
      >
        {/* Local Video Card */}
        <div className="glass-card" style={{ width: 140, height: 96, borderRadius: 16, overflow: 'hidden', position: 'relative', border: '1px solid rgba(99, 102, 241, 0.4)', flexShrink: 0 }}>
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.8), rgba(15, 23, 42, 0.95))' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99, 102, 241, 0.25)', border: '1px solid rgba(165, 180, 252, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#a5b4fc' }}>
              {localPlayer ? localPlayer.name.charAt(0).toUpperCase() : 'Y'}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#cbd5e1', marginTop: 4 }}>You (Me)</span>
          </div>
          <div style={{ position: 'absolute', bottom: 6, left: 8, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: 6, fontSize: 9, color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
            <i className={`fas ${micMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} style={{ color: micMuted ? '#f87171' : '#4ade80', fontSize: 9 }}></i>
            <span style={{ fontWeight: 600, maxWidth: 65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{localPlayer?.name || 'Player'}</span>
          </div>
          {!micMuted && <div className="speaking-glow" style={{ position: 'absolute', inset: 0, borderRadius: 16, pointerEvents: 'none' }} />}
        </div>

        {/* Proximity Peers */}
        {allPlayers
          .filter((p) => p.id !== selfId && (localPlayer && Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y) <= 165))
          .map((peer) => (
            <div key={peer.id} className="glass-card" style={{ width: 140, height: 96, borderRadius: 16, overflow: 'hidden', position: 'relative', border: '1px solid rgba(52, 211, 153, 0.5)', flexShrink: 0 }}>
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(6, 78, 59, 0.4))' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${peer.color}25`, border: `1.5px solid ${peer.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: peer.color }}>
                  {peer.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#cbd5e1', marginTop: 4 }}>{peer.name}</span>
              </div>
              <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(16, 185, 129, 0.3)', color: '#6ee7b7', fontSize: 8, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(110, 231, 183, 0.3)' }}>
                RADAR
              </div>
            </div>
          ))}
      </div>

      {/* ── 4. Top-Right: Spatial Mini-Map ───────────────────────────── */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 30, pointerEvents: 'auto' }}>
        <div className="glass-card" style={{ padding: 10, borderRadius: 18, border: '1px solid rgba(255, 255, 255, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-compass" style={{ color: '#818cf8' }}></i> SPATIAL MAP
            </span>
            <span style={{ fontSize: 10, background: 'rgba(6, 78, 59, 0.8)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 700 }}>
              {allPlayers.length} Active
            </span>
          </div>
          <div style={{ width: 176, height: 128, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <MiniMap players={players} selfId={selfId} localPlayer={localPlayer} />
          </div>
        </div>
      </div>

      {/* ── 5. Dynamic Zone Notification Banner (Clean clearance below video cards) */}
      {zoneBannerVisible && zoneBannerText && (
        <div style={{ position: 'fixed', top: 130, left: '50%', transform: 'translateX(-50%)', zIndex: 25, pointerEvents: 'none', transition: 'all 0.4s ease' }}>
          <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderRadius: 9999, border: '1px solid rgba(56, 189, 248, 0.5)', color: '#bae6fd', fontSize: 13, fontWeight: 600, boxShadow: '0 12px 32px rgba(8, 47, 73, 0.5)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
            <span>Entered {zoneBannerText}</span>
          </div>
        </div>
      )}

      {/* ── 6. Floating Interact Prompt Badge ────────────────────────── */}
      {activePrompt && (
        <div style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', zIndex: 30, pointerEvents: 'auto' }}>
          <div
            className="glass-card"
            onClick={() => {
              if (activePrompt.includes('Whiteboard')) setWhiteboardOpen(true);
              else if (activePrompt.includes('Espresso') || activePrompt.includes('Coffee')) setCoffeeOpen(true);
              else if (activePrompt.includes('Stage') || activePrompt.includes('Podium')) setPodiumOpen(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderRadius: 16, border: '1px solid rgba(245, 158, 11, 0.6)', color: '#fef08a', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 12px 32px rgba(120, 53, 15, 0.4)' }}
          >
            <span className="key-badge" style={{ color: '#facc15', border: '1px solid rgba(250, 204, 21, 0.5)', background: 'rgba(250, 204, 21, 0.2)' }}>E</span>
            <span>{activePrompt}</span>
          </div>
        </div>
      )}

      {/* ── 7. Floating Bottom Dock ─────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 30, pointerEvents: 'auto' }}>
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
          
          {/* Mic */}
          <div className="has-tooltip">
            <button
              onClick={toggleMic}
              style={{ width: 44, height: 44, borderRadius: 14, background: micMuted ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.08)', border: micMuted ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.12)', color: micMuted ? '#f87171' : '#4ade80', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <i className={`fas ${micMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} style={{ fontSize: 16 }}></i>
              <span style={{ fontSize: 8, marginTop: 2, color: '#94a3b8', fontWeight: 600 }}>Mic</span>
            </button>
            <div className="tooltip-pop">Toggle Mic [M]</div>
          </div>

          {/* Cam */}
          <div className="has-tooltip">
            <button
              onClick={toggleCam}
              style={{ width: 44, height: 44, borderRadius: 14, background: camOff ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.08)', border: camOff ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.12)', color: camOff ? '#f87171' : '#4ade80', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <i className={`fas ${camOff ? 'fa-video-slash' : 'fa-video'}`} style={{ fontSize: 16 }}></i>
              <span style={{ fontSize: 8, marginTop: 2, color: '#94a3b8', fontWeight: 600 }}>Cam</span>
            </button>
            <div className="tooltip-pop">Toggle Cam [V]</div>
          </div>

          {/* Screen Share */}
          <div className="has-tooltip">
            <button
              onClick={() => setScreenShared((s) => !s)}
              style={{ width: 44, height: 44, borderRadius: 14, background: screenShared ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.08)', border: screenShared ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.12)', color: screenShared ? '#a5b4fc' : '#cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <i className="fas fa-desktop" style={{ fontSize: 16 }}></i>
              <span style={{ fontSize: 8, marginTop: 2, color: '#94a3b8', fontWeight: 600 }}>Share</span>
            </button>
            <div className="tooltip-pop">Screen Share</div>
          </div>

          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

          {/* Quick Emotes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.3)', padding: '3px 8px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
            {['👋', '👏', '❤️', '✋', '😂', '☕', '🚀'].map((em) => (
              <button
                key={em}
                onClick={() => triggerEmote(em)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 2, transition: 'transform 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1.0)')}
              >
                {em}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

          {/* Side Panel Toggle */}
          <div className="has-tooltip">
            <button
              onClick={() => {
                setSidePanelOpen((o) => !o);
                setUnreadCount(0);
              }}
              style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', boxShadow: '0 6px 16px rgba(99, 102, 241, 0.4)' }}
            >
              <i className="fas fa-comment-dots" style={{ fontSize: 16 }}></i>
              <span style={{ fontSize: 8, marginTop: 2, color: '#e0e7ff', fontWeight: 600 }}>Panel</span>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0f172a' }}>
                  {unreadCount}
                </span>
              )}
            </button>
            <div className="tooltip-pop">Side Panel [C]</div>
          </div>
        </div>
      </div>

      {/* ── 8. Slide-Out Side Panel ─────────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          position: 'fixed',
          right: 16,
          top: 80,
          bottom: 84,
          width: 320,
          borderRadius: 24,
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: sidePanelOpen ? 'translateX(0)' : 'translateX(115%)',
          pointerEvents: 'auto',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.7)'
        }}
      >
        {/* Header Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', padding: 10, gap: 6, borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <button
            onClick={() => setActiveTab('chat')}
            style={{ flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, borderRadius: 10, background: activeTab === 'chat' ? '#6366f1' : 'transparent', color: activeTab === 'chat' ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            <i className="fas fa-comment-dots"></i> Chat
          </button>
          <button
            onClick={() => setActiveTab('people')}
            style={{ flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, borderRadius: 10, background: activeTab === 'people' ? '#6366f1' : 'transparent', color: activeTab === 'people' ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            <i className="fas fa-users"></i> People
          </button>
          <button
            onClick={() => setActiveTab('avatar')}
            style={{ flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, borderRadius: 10, background: activeTab === 'avatar' ? '#6366f1' : 'transparent', color: activeTab === 'avatar' ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            <i className="fas fa-user-pen"></i> Avatar
          </button>
          <button
            onClick={() => setSidePanelOpen(false)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 6, borderRadius: 8 }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Tab 1: Chat */}
        {activeTab === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 12 }}>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: 3, borderRadius: 10, marginBottom: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => setChatScope('spatial')}
                style={{ flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 700, borderRadius: 8, background: chatScope === 'spatial' ? '#6366f1' : 'transparent', color: chatScope === 'spatial' ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer' }}
              >
                Nearby (Proximity)
              </button>
              <button
                onClick={() => setChatScope('global')}
                style={{ flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 700, borderRadius: 8, background: chatScope === 'global' ? '#6366f1' : 'transparent', color: chatScope === 'global' ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer' }}
              >
                Global (Office)
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
              {chatMessages.length === 0 ? (
                <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 30 }}>
                  No messages yet. Say hello to colleagues nearby!
                </div>
              ) : (
                chatMessages.map((m) => (
                  <div key={m.id} style={{ background: 'rgba(0,0,0,0.35)', padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: m.senderId === selfId ? '#a5b4fc' : '#38bdf8' }}>{m.senderName}</span>
                      <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>{m.scope}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#f1f5f9', wordBreak: 'break-word' }}>{m.text}</div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
              style={{ display: 'flex', gap: 8, marginTop: 10 }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type message (Enter)..."
                maxLength={140}
                style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: '#fff', outline: 'none' }}
              />
              <button
                type="submit"
                style={{ background: '#6366f1', border: 'none', color: '#fff', borderRadius: 10, padding: '0 12px', cursor: 'pointer' }}
              >
                <i className="fas fa-paper-plane" style={{ fontSize: 11 }}></i>
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: People */}
        {activeTab === 'people' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
              Active in Workspace ({allPlayers.length})
            </div>
            {allPlayers.map((p) => {
              const isMe = p.id === selfId;
              const pZone = zoneLabelFor(p.zoneId);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${p.color}30`, border: `1.5px solid ${p.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: p.color }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                        {p.name} {isMe && <span style={{ color: '#818cf8', fontSize: 10 }}>(You)</span>}
                      </div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>
                        <i className="fas fa-map-pin" style={{ fontSize: 8, color: '#818cf8' }}></i> {pZone}
                      </div>
                    </div>
                  </div>
                  {!isMe && (
                    <button
                      onClick={() => {
                        handleMove({ x: p.x - 40, y: p.y, dir: 'right', isMoving: false, zoneId: p.zoneId });
                        triggerEmote('⚡');
                      }}
                      style={{ fontSize: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#a5b4fc', padding: '3px 8px', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Teleport
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: Avatar */}
        {activeTab === 'avatar' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: 12, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: localPlayer?.color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                {localPlayer?.name?.charAt(0).toUpperCase() || 'P'}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{localPlayer?.name || 'Player'}</div>
                <div style={{ fontSize: 11, color: '#818cf8' }}>Virtual Workspace Active</div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Your Name</label>
              <input
                type="text"
                value={localPlayer?.name || ''}
                onChange={(e) => {
                  const newName = e.target.value;
                  setLocalPlayer((p) => p ? { ...p, name: newName } : p);
                }}
                maxLength={20}
                style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#fff', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Outfit Color</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setLocalPlayer((p) => p ? { ...p, color: c } : p);
                    }}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: localPlayer?.color === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', transform: localPlayer?.color === c ? 'scale(1.15)' : 'none' }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Hair Style</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {HAIR_STYLES.map((h) => (
                  <button
                    key={h.id}
                    style={{ padding: '8px 0', fontSize: 11, fontWeight: 600, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', cursor: 'pointer' }}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL 1: Collaborative Whiteboard ──────────────────────── */}
      {whiteboardOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 860, height: '80vh', borderRadius: 24, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="fas fa-pen-ruler" style={{ color: '#38bdf8', fontSize: 18 }}></i>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>Station Whiteboard & Ideas Canvas</h3>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Collaborative team sketch station</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 3, gap: 4, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <button
                    onClick={() => setWbTool('pen')}
                    style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, background: wbTool === 'pen' ? '#6366f1' : 'transparent', color: wbTool === 'pen' ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer' }}
                  >
                    Pen
                  </button>
                  <button
                    onClick={() => setWbTool('highlighter')}
                    style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, background: wbTool === 'highlighter' ? '#6366f1' : 'transparent', color: wbTool === 'highlighter' ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer' }}
                  >
                    Glow
                  </button>
                  <button
                    onClick={() => setWbTool('eraser')}
                    style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, background: wbTool === 'eraser' ? '#6366f1' : 'transparent', color: wbTool === 'eraser' ? '#fff' : '#94a3b8', border: 'none', cursor: 'pointer' }}
                  >
                    Eraser
                  </button>
                  <input
                    type="color"
                    value={wbColor}
                    onChange={(e) => setWbColor(e.target.value)}
                    style={{ width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer' }}
                  />
                </div>
                <button
                  onClick={() => setWhiteboardOpen(false)}
                  style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>
            <div style={{ flex: 1, position: 'relative', background: '#0f172a' }}>
              <canvas
                ref={wbCanvasRef}
                onMouseDown={onWbMouseDown}
                onMouseMove={onWbMouseMove}
                onMouseUp={onWbMouseUp}
                style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Coffee & Chai Break Lounge ────────────────────── */}
      {coffeeOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 420, borderRadius: 24, padding: 24, textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.4)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#fbbf24' }}>
              ☕
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Office Chai & Espresso Bar</h3>
            <p style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 18 }}>Take a sprint breather! Brewing grants a +25% walking speed energy boost.</p>
            
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
                  triggerEmote('☕');
                }}
                style={{ flex: 1, padding: '12px 0', background: 'linear-gradient(135deg, #d97706, #b45309)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 16px rgba(217, 119, 6, 0.3)' }}
              >
                Brew Cup (+Speed Boost)
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

      {/* ── MODAL 3: Townhall Stage Podium ─────────────────────────── */}
      {podiumOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 420, borderRadius: 24, padding: 24, textAlign: 'center', border: '1px solid rgba(192, 132, 252, 0.4)' }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(192, 132, 252, 0.2)', border: '1px solid rgba(192, 132, 252, 0.4)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              📢
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Auditorium Main Stage Podium</h3>
            <p style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 18 }}>You have stepped onto the speaker's podium. Broadcast mode is enabled across the space!</p>
            
            <div style={{ padding: 12, background: 'rgba(74, 4, 78, 0.4)', border: '1px solid rgba(192, 132, 252, 0.4)', borderRadius: 12, textAlign: 'left', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f3e8ff', marginBottom: 2 }}>
                <i className="fas fa-bullhorn"></i> Global Broadcast Active
              </div>
              <p style={{ fontSize: 11, color: '#e9d5ff', margin: 0, opacity: 0.85 }}>All proximity distance filters are bypassed while occupying this stage.</p>
            </div>

            <button
              onClick={() => setPodiumOpen(false)}
              style={{ width: '100%', padding: '12px 0', background: '#9333ea', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Continue Presenting
            </button>
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
