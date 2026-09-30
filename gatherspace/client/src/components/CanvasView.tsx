// client/src/components/CanvasView.tsx
// High-fidelity 2D Spatial Office Canvas with Smooth Lerp Camera, Dynamic Zoom,
// Floating Reaction Bubbles, Teleport Warp VFX, Particle Footsteps, and Interactive Stations.

import React, { useRef, useEffect, useCallback } from 'react';
import mapData from '../mapData.json';
import { PlayerState, Direction } from '../types';
import { resolveMovement, getPlayerZone } from '../utils/math';
import { soundFX } from '../utils/audio';
import { lofiEngine } from '../utils/lofiAudio';
import { youtubeAudio } from '../utils/youtubeAudio';

interface SpeechBubble {
  playerId: string;
  text: string;
  expiresAt: number;
}

interface ReactionBubble {
  id: string;
  playerId: string;
  emoji: string;
  x: number;
  y: number;
  vy: number;
  birthTime: number;
  duration: number;
  wobblePhase: number;
}

interface WarpEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
  life: number;
  symbol?: string;
}

interface CanvasViewProps {
  localPlayer: PlayerState;
  players: Record<string, PlayerState>;
  selfId: string;
  zoom?: number;
  onMove: (pos: { x: number; y: number; dir: Direction; isMoving: boolean; zoneId: string | null }) => void;
  onInteractPrompt?: (prompt: string | null, actionKey?: string) => void;
  onTriggerInteract?: (actionKey: string) => void;
}

const PLANTS = [
  { x: 130, y: 140, r: 16 },
  { x: 700, y: 140, r: 16 },
  { x: 130, y: 620, r: 16 },
  { x: 700, y: 620, r: 16 },
  { x: 130, y: 1130, r: 16 },
  { x: 860, y: 140, r: 16 },
  { x: 1630, y: 140, r: 16 },
  { x: 860, y: 1200, r: 18 },
  { x: 1630, y: 1470, r: 18 },
  { x: 2250, y: 140, r: 18 },
  { x: 2250, y: 1470, r: 20 }
];

export const CanvasView: React.FC<CanvasViewProps> = ({
  localPlayer,
  players,
  selfId,
  zoom = 1.0,
  onMove,
  onInteractPrompt,
  onTriggerInteract,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysDown = useRef<Set<string>>(new Set());
  const clickTarget = useRef<{ x: number; y: number } | null>(null);
  const localPos = useRef({
    x: localPlayer.x,
    y: localPlayer.y,
    dir: (localPlayer.dir || 'down') as Direction,
    walkFrame: 0,
    speedBoost: 1.0,
    zoneId: null as string | null,
  });
  
  const camPos = useRef({ x: localPlayer.x, y: localPlayer.y });
  const speechBubbles = useRef<SpeechBubble[]>([]);
  const reactionBubbles = useRef<ReactionBubble[]>([]);
  const warpEffects = useRef<WarpEffect[]>([]);
  const particles = useRef<Particle[]>([]);
  const activeInteractKey = useRef<string | null>(null);
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const remoteInterpRef = useRef<Record<string, { x: number; y: number; walkFrame: number }>>({});

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onInteractPromptRef = useRef(onInteractPrompt);
  onInteractPromptRef.current = onInteractPrompt;
  const onTriggerInteractRef = useRef(onTriggerInteract);
  onTriggerInteractRef.current = onTriggerInteract;

  // Sync teleport positions directly from props
  useEffect(() => {
    if (Math.abs(localPos.current.x - localPlayer.x) > 30 || Math.abs(localPos.current.y - localPlayer.y) > 30) {
      // Spawn warp ring effect
      warpEffects.current.push({
        x: localPlayer.x,
        y: localPlayer.y,
        radius: 4,
        maxRadius: 45,
        alpha: 1.0,
        color: '#38bdf8',
      });
      localPos.current.x = localPlayer.x;
      localPos.current.y = localPlayer.y;
      clickTarget.current = null;
    }
  }, [localPlayer.x, localPlayer.y]);

  // Handle Canvas Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    const parent = canvas.parentElement;
    if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Keyboard Input & Interact 'E' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        keysDown.current.add(key);
        clickTarget.current = null;
      }

      if (key === 'e' || key === ' ') {
        if (activeInteractKey.current && onTriggerInteractRef.current) {
          onTriggerInteractRef.current(activeInteractKey.current);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Click-to-move & direct interactable click
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const W = canvas.width;
      const H = canvas.height;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const worldX = (screenX - W / 2) / zoom + camPos.current.x;
      const worldY = (screenY - H / 2) / zoom + camPos.current.y;

      // Check if user clicked directly on an interactable
      if (mapData.interactables) {
        for (const item of mapData.interactables) {
          const dist = Math.hypot(worldX - item.x, worldY - item.y);
          if (dist <= item.radius + 20) {
            if (onTriggerInteractRef.current) {
              onTriggerInteractRef.current(item.type);
            }
            return;
          }
        }
      }

      clickTarget.current = {
        x: Math.max(20, Math.min(mapData.world.width - 20, worldX)),
        y: Math.max(20, Math.min(mapData.world.height - 20, worldY)),
      };
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [zoom]);

  // Reaction and Speech Bubble Listeners
  const addReactionBubble = useCallback((playerId: string, emoji: string) => {
    const p = players[playerId] || (playerId === selfId ? localPlayer : null);
    const startX = p ? (playerId === selfId ? localPos.current.x : p.x) : localPos.current.x;
    const startY = p ? (playerId === selfId ? localPos.current.y : p.y) : localPos.current.y;

    reactionBubbles.current.push({
      id: Math.random().toString(36).slice(2),
      playerId,
      emoji,
      x: startX,
      y: startY - 26,
      vy: -1.3 - Math.random() * 0.5,
      birthTime: Date.now(),
      duration: 2600,
      wobblePhase: Math.random() * Math.PI * 2,
    });
  }, [players, selfId, localPlayer]);

  const addSpeechBubble = useCallback((playerId: string, text: string) => {
    // If it's a short reaction emoji, render as floating reaction bubble instead of box!
    const isSingleEmoji = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}){1,3}$/u.test(text.trim());
    if (isSingleEmoji) {
      addReactionBubble(playerId, text.trim());
      return;
    }

    speechBubbles.current = speechBubbles.current.filter((b) => b.playerId !== playerId);
    speechBubbles.current.push({ playerId, text, expiresAt: Date.now() + 4500 });
  }, [addReactionBubble]);

  useEffect(() => {
    const handleSpeech = (e: Event) => {
      const { playerId, text } = (e as CustomEvent).detail;
      addSpeechBubble(playerId, text);
    };
    const handleReaction = (e: Event) => {
      const { playerId, emoji } = (e as CustomEvent).detail;
      addReactionBubble(playerId, emoji);
    };

    window.addEventListener('gatherspace:speech', handleSpeech);
    window.addEventListener('gatherspace:reaction', handleReaction);
    return () => {
      window.removeEventListener('gatherspace:speech', handleSpeech);
      window.removeEventListener('gatherspace:reaction', handleReaction);
    };
  }, [addSpeechBubble, addReactionBubble]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const BASE_SPEED = 3.8;

    const render = () => {
      const currentZoom = zoomRef.current;
      const currentPlayers = playersRef.current;
      const currentSelfId = selfIdRef.current;
      const remoteInterp = remoteInterpRef.current;
      // ── 1. Movement Calculations ──────────────────────────────────────────
      let dx = 0;
      let dy = 0;
      let dir = localPos.current.dir;
      const currentSpeed = BASE_SPEED * localPos.current.speedBoost;

      if (keysDown.current.has('w') || keysDown.current.has('arrowup')) { dy -= currentSpeed; dir = 'up'; }
      if (keysDown.current.has('s') || keysDown.current.has('arrowdown')) { dy += currentSpeed; dir = 'down'; }
      if (keysDown.current.has('a') || keysDown.current.has('arrowleft')) { dx -= currentSpeed; dir = 'left'; }
      if (keysDown.current.has('d') || keysDown.current.has('arrowright')) { dx += currentSpeed; dir = 'right'; }

      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      let isMoving = dx !== 0 || dy !== 0;

      if (isMoving) {
        clickTarget.current = null;
        const resolved = resolveMovement(localPos.current.x, localPos.current.y, dx, dy);
        localPos.current.x = resolved.x;
        localPos.current.y = resolved.y;
        localPos.current.dir = dir;
        localPos.current.walkFrame += 0.22;

        const isWood = !localPos.current.zoneId || localPos.current.zoneId === 'lobby';
        soundFX.footstep(isWood);

        if (Math.random() < 0.35) {
          particles.current.push({
            x: resolved.x + (Math.random() * 8 - 4),
            y: resolved.y + 12,
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.8,
            alpha: 0.5,
            size: Math.random() * 3 + 2,
            color: isWood ? '#78350f' : '#6366f1',
            life: 18,
          });
        }

        const newZoneId = getPlayerZone(resolved.x, resolved.y);
        if (newZoneId !== localPos.current.zoneId) {
          localPos.current.zoneId = newZoneId;
          soundFX.zoneChime();
        }

        onMoveRef.current({ x: resolved.x, y: resolved.y, dir, isMoving, zoneId: newZoneId });
      } else if (clickTarget.current) {
        const cdx = clickTarget.current.x - localPos.current.x;
        const cdy = clickTarget.current.y - localPos.current.y;
        const dist = Math.hypot(cdx, cdy);

        if (dist > 4) {
          isMoving = true;
          const stepX = (cdx / dist) * currentSpeed;
          const stepY = (cdy / dist) * currentSpeed;

          if (Math.abs(cdx) > Math.abs(cdy)) {
            dir = cdx > 0 ? 'right' : 'left';
          } else {
            dir = cdy > 0 ? 'down' : 'up';
          }

          const resolved = resolveMovement(localPos.current.x, localPos.current.y, stepX, stepY);
          localPos.current.x = resolved.x;
          localPos.current.y = resolved.y;
          localPos.current.dir = dir;
          localPos.current.walkFrame += 0.22;

          const isWood = !localPos.current.zoneId || localPos.current.zoneId === 'lobby';
          soundFX.footstep(isWood);

          const newZoneId = getPlayerZone(resolved.x, resolved.y);
          if (newZoneId !== localPos.current.zoneId) {
            localPos.current.zoneId = newZoneId;
            soundFX.zoneChime();
          }

          onMoveRef.current({ x: resolved.x, y: resolved.y, dir, isMoving, zoneId: newZoneId });
        } else {
          clickTarget.current = null;
        }
      }

      // Check Interactable Hotspots
      let promptText: string | null = null;
      let promptKey: string | null = null;

      if (mapData.interactables) {
        for (const item of mapData.interactables) {
          const dist = Math.hypot(localPos.current.x - item.x, localPos.current.y - item.y);
          if (dist <= item.radius) {
            promptText = item.prompt;
            promptKey = item.type;
            break;
          }
        }
      }
      activeInteractKey.current = promptKey;
      if (onInteractPromptRef.current) {
        onInteractPromptRef.current(promptText, promptKey || undefined);
      }

      // Update spatial YouTube audio engine (static LoFi synthesizer commented out)
      // lofiEngine.updateSpatialPosition(localPos.current.x, localPos.current.y, localPos.current.zoneId);
      youtubeAudio.updateSpatialPosition(localPos.current.x, localPos.current.y, localPos.current.zoneId);

      // Ambient coffee steam particles over espresso bar
      if (Math.random() < 0.22) {
        particles.current.push({
          x: 1240 + (Math.random() * 40 - 20),
          y: 1255,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.6 - Math.random() * 0.5,
          alpha: 0.45,
          size: Math.random() * 3 + 2,
          color: '#ffffff',
          life: 38,
        });
      }

      // Ambient floating musical notes in chill lounge
      if ((localPos.current.zoneId === 'coffee_lounge' || localPos.current.zoneId === 'gaming_corner') && Math.random() < 0.06) {
        particles.current.push({
          x: localPos.current.x + (Math.random() * 60 - 30),
          y: localPos.current.y - 10,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.8 - Math.random() * 0.4,
          alpha: 0.8,
          size: 11,
          color: '#fbbf24',
          life: 45,
          symbol: Math.random() < 0.5 ? '♪' : '♫',
        });
      }

      // ── 2. Smooth Lerp Camera System ─────────────────────────────────────
      const W = canvas.width;
      const H = canvas.height;

      let leadX = 0;
      let leadY = 0;
      if (isMoving) {
        if (dir === 'right') leadX = 35;
        if (dir === 'left') leadX = -35;
        if (dir === 'down') leadY = 35;
        if (dir === 'up') leadY = -35;
      }

      const targetCamX = localPos.current.x + leadX;
      const targetCamY = localPos.current.y + leadY;

      camPos.current.x += (targetCamX - camPos.current.x) * 0.12;
      camPos.current.y += (targetCamY - camPos.current.y) * 0.12;

      const halfVisibleW = (W / 2) / currentZoom;
      const halfVisibleH = (H / 2) / currentZoom;

      const clampedCamX = Math.max(halfVisibleW, Math.min(mapData.world.width - halfVisibleW, camPos.current.x));
      const clampedCamY = Math.max(halfVisibleH, Math.min(mapData.world.height - halfVisibleH, camPos.current.y));

      // ── 3. Render World & Canvas Transformation ─────────────────────────
      ctx.save();
      ctx.clearRect(0, 0, W, H);

      ctx.translate(W / 2, H / 2);
      ctx.scale(currentZoom, currentZoom);
      ctx.translate(-clampedCamX, -clampedCamY);

      // Hallway Floor (Warm Oak Planks)
      ctx.fillStyle = '#181411';
      ctx.fillRect(0, 0, mapData.world.width, mapData.world.height);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 1.5;
      for (let py = 0; py < mapData.world.height; py += 32) {
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(mapData.world.width, py); ctx.stroke();
      }
      for (let px = 0; px < mapData.world.width; px += 96) {
        for (let py = 0; py < mapData.world.height; py += 64) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 32); ctx.stroke();
        }
      }

      // ── 4. Zones with Rich Floor Textures ────────────────────────────────
      mapData.zones.forEach((zone) => {
        ctx.save();
        ctx.fillStyle = zone.color;
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

        if (zone.floorType === 'parquet') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.lineWidth = 1.5;
          for (let py = zone.y; py < zone.y + zone.h; py += 28) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 3;
          ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(zone.x + 120, zone.y + 140, zone.w - 240, zone.h - 200, 24);
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (zone.floorType === 'tiles') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 2;
          for (let px = zone.x; px < zone.x + zone.w; px += 60) {
            ctx.beginPath(); ctx.moveTo(px, zone.y); ctx.lineTo(px, zone.y + zone.h); ctx.stroke();
          }
          for (let py = zone.y; py < zone.y + zone.h; py += 60) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
        } else if (zone.floorType === 'carpet_navy' || zone.floorType === 'carpet_emerald') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = 2;
          for (let py = zone.y; py < zone.y + zone.h; py += 12) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
          ctx.strokeStyle = zone.floorType === 'carpet_navy' ? 'rgba(99, 102, 241, 0.6)' : 'rgba(16, 185, 129, 0.6)';
          ctx.lineWidth = 3;
          ctx.strokeRect(zone.x + 8, zone.y + 8, zone.w - 16, zone.h - 16);
        } else if (zone.floorType === 'stage_wood') {
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.5)';
          ctx.lineWidth = 4;
          ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

          const grad = ctx.createRadialGradient(zone.x + zone.w / 2, zone.y + 200, 20, zone.x + zone.w / 2, zone.y + 200, 280);
          grad.addColorStop(0, 'rgba(250, 204, 21, 0.28)');
          grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        }

        // Zone Signage Plaque (Crisp, High Contrast & Readable)
        ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
        const labelWidth = ctx.measureText(zone.label).width;
        const plaqueW = labelWidth + 32;
        const plaqueH = 32;
        const plaqueX = zone.x + 24;
        const plaqueY = zone.y + 16;

        ctx.fillStyle = 'rgba(10, 13, 20, 0.95)';
        ctx.beginPath();
        ctx.roundRect(plaqueX, plaqueY, plaqueW, plaqueH, 8);
        ctx.fill();
        ctx.strokeStyle = zone.borderColor || 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.fillText(zone.label, plaqueX + 16, plaqueY + 21);

        ctx.restore();
      });

      // ── 5. Walls & Colliders ─────────────────────────────────────────────
      mapData.colliders.forEach((c) => {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(c.x + 6, c.y + 6, c.w, c.h);

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x, c.y, c.w, c.h);
        ctx.restore();
      });

      // ── 6. Furniture & Interactive Stations ──────────────────────────────
      mapData.furniture.forEach((obs) => {
        ctx.save();
        if (obs.type === 'reception_desk') {
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(obs.x + 4, obs.y + 6, obs.w, obs.h, 16);
          ctx.fill();

          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 16);
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(obs.x + obs.w / 2 - 25, obs.y + 20, 50, 6);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(obs.x + obs.w / 2 - 15, obs.y + 32, 30, 12);

          ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('RECEPTION & CONCIERGE', obs.x + 20, obs.y + obs.h - 14);
        } else if (obs.type === 'boardroom_table' || obs.type === 'strategy_table') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.beginPath();
          ctx.roundRect(obs.x + 6, obs.y + 8, obs.w, obs.h, 28);
          ctx.fill();

          ctx.fillStyle = '#261c14';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 28);
          ctx.fill();
          ctx.strokeStyle = '#5c4033';
          ctx.lineWidth = 3;
          ctx.stroke();

          ctx.fillStyle = '#475569';
          for (let cx = obs.x + 35; cx < obs.x + obs.w - 20; cx += 45) {
            ctx.beginPath();
            ctx.arc(cx, obs.y - 8, 8, 0, Math.PI * 2);
            ctx.arc(cx, obs.y + obs.h + 8, 8, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (obs.type === 'work_desk') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath();
          ctx.roundRect(obs.x + 4, obs.y + 6, obs.w, obs.h, 10);
          ctx.fill();

          ctx.fillStyle = '#2c251d';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 10);
          ctx.fill();
          ctx.strokeStyle = '#4a3b2c';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#0284c7';
          ctx.fillRect(obs.x + 22, obs.y + 14, 46, 6);
          ctx.fillStyle = '#8b5cf6';
          ctx.fillRect(obs.x + 76, obs.y + 14, 46, 6);

          ctx.fillStyle = '#0284c7';
          ctx.fillRect(obs.x + 158, obs.y + 14, 46, 6);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(obs.x + 212, obs.y + 14, 46, 6);

          ctx.fillStyle = '#64748b';
          ctx.beginPath();
          ctx.arc(obs.x + 66, obs.y + obs.h + 10, 10, 0, Math.PI * 2);
          ctx.arc(obs.x + 202, obs.y + obs.h + 10, 10, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(obs.label, obs.x + 14, obs.y + obs.h - 12);
        } else if (obs.type === 'whiteboard_item') {
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 10);
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Sticky notes swatches
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(obs.x + 12, obs.y + 16, 14, 18);
          ctx.fillStyle = '#bbf7d0';
          ctx.fillRect(obs.x + 32, obs.y + 16, 14, 18);
          ctx.fillStyle = '#fecdd3';
          ctx.fillRect(obs.x + 52, obs.y + 16, 14, 18);

          ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#38bdf8';
          ctx.textAlign = 'left';
          ctx.fillText('COLLABORATIVE WHITEBOARD (E)', obs.x + 76, obs.y + obs.h / 2 + 4);
        } else if (obs.type === 'coffee_bar') {
          ctx.fillStyle = '#3e2723';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 12);
          ctx.fill();
          ctx.strokeStyle = '#8d6e63';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#fef3c7';
          ctx.textAlign = 'center';
          ctx.fillText('☕ CHAI & ESPRESSO BAR (E)', obs.x + obs.w / 2, obs.y + 42);
        } else if (obs.type === 'podium_stand') {
          ctx.fillStyle = '#4a044e';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8);
          ctx.fill();
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#f3e8ff';
          ctx.textAlign = 'center';
          ctx.fillText('STAGE (E)', obs.x + obs.w / 2, obs.y + 35);
        } else if (obs.type === 'arcade') {
          ctx.fillStyle = '#064e3b';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8);
          ctx.fill();
          ctx.fillStyle = '#10b981';
          ctx.fillRect(obs.x + 15, obs.y + 10, obs.w - 30, 22);
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#a7f3d0';
          ctx.textAlign = 'center';
          ctx.fillText('ARCADE (E)', obs.x + obs.w / 2, obs.y + obs.h - 10);
        } else if (obs.type === 'lounge_sofa') {
          ctx.fillStyle = '#1e1b4b';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 18);
          ctx.fill();
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#c7d2fe';
          ctx.textAlign = 'center';
          ctx.fillText('🛋️ RELAX LOUNGE', obs.x + obs.w / 2, obs.y + obs.h / 2 + 5);
        }
        ctx.restore();
      });

      // ── 7. Architectural Potted Planters (Minimalist) ────────────────────
      PLANTS.forEach((p) => {
        ctx.save();
        // Ceramic Pot Base
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Subtle Foliage Core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = '#14532d';
        ctx.fill();
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });

      // ── 8. Footstep, Steam & Music Note Particles ──────────────────────────
      particles.current.forEach((pt) => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life -= 1;
        pt.alpha *= 0.94;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, pt.alpha));
        if (pt.symbol) {
          ctx.font = 'bold 14px sans-serif';
          ctx.fillStyle = pt.color;
          ctx.textAlign = 'center';
          ctx.fillText(pt.symbol, pt.x, pt.y);
        } else {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fillStyle = pt.color;
          ctx.fill();
        }
        ctx.restore();
      });
      particles.current = particles.current.filter((pt) => pt.life > 0 && pt.alpha > 0.02);

      // Warp shockwave rings
      warpEffects.current.forEach((w) => {
        w.radius += 2.5;
        w.alpha *= 0.88;

        ctx.save();
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = w.alpha;
        ctx.stroke();
        ctx.restore();
      });
      warpEffects.current = warpEffects.current.filter((w) => w.alpha > 0.05);

      // ── 9. Spatial Proximity Aura (Local Player) ────────────────────────
      const auraGrad = ctx.createRadialGradient(localPos.current.x, localPos.current.y, 20, localPos.current.x, localPos.current.y, 165);
      auraGrad.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
      auraGrad.addColorStop(0.8, 'rgba(99, 102, 241, 0.03)');
      auraGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(localPos.current.x, localPos.current.y, 165, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(localPos.current.x, localPos.current.y, 165, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);

      // Click destination marker
      if (clickTarget.current) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(clickTarget.current.x, clickTarget.current.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(clickTarget.current.x, clickTarget.current.y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // ── 10. Players Rendering ────────────────────────────────────────────
      const now = Date.now();
      speechBubbles.current = speechBubbles.current.filter((b) => b.expiresAt > now);

      Object.values(currentPlayers).forEach((p) => {
        const isSelf = p.id === currentSelfId;

        let px: number;
        let py: number;
        let walkFrame = 0;

        if (isSelf) {
          px = localPos.current.x;
          py = localPos.current.y;
          walkFrame = localPos.current.walkFrame;
        } else {
          const interp = remoteInterp[p.id] ?? { x: p.x, y: p.y, walkFrame: 0 };
          interp.x += (p.x - interp.x) * 0.22;
          interp.y += (p.y - interp.y) * 0.22;
          if (p.isMoving) interp.walkFrame += 0.2;
          remoteInterp[p.id] = interp;
          px = interp.x;
          py = interp.y;
          walkFrame = interp.walkFrame;
        }

        const playerDir = isSelf ? localPos.current.dir : p.dir;
        const walkBob = (isSelf ? isMoving : p.isMoving) ? Math.sin(walkFrame) * 2.5 : 0;

        // Shadow
        ctx.beginPath();
        ctx.ellipse(px, py + 14, 14, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(px, py + 4 + walkBob, 12, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Head
        ctx.beginPath();
        ctx.arc(px, py - 8 + walkBob, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#fed7aa';
        ctx.fill();
        ctx.stroke();

        // Hair
        ctx.beginPath();
        ctx.fillStyle = p.hairColor || '#1e293b';
        ctx.arc(px, py - 12 + walkBob, 9, Math.PI, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#0f172a';
        if (playerDir === 'left') {
          ctx.fillRect(px - 6, py - 8 + walkBob, 2.5, 3.5);
        } else if (playerDir === 'right') {
          ctx.fillRect(px + 4, py - 8 + walkBob, 2.5, 3.5);
        } else if (playerDir !== 'up') {
          ctx.fillRect(px - 4, py - 8 + walkBob, 2.5, 3.5);
          ctx.fillRect(px + 2, py - 8 + walkBob, 2.5, 3.5);
        }

        // Nametag pill with status dot (Large, Bold & Crisp)
        ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        const textWidth = ctx.measureText(p.name).width;
        const pillW = textWidth + 32;
        const pillH = 26;
        const pillX = px - pillW / 2;
        const pillY = py - 44 + walkBob;

        ctx.fillStyle = isSelf ? 'rgba(99, 102, 241, 0.95)' : 'rgba(10, 13, 20, 0.92)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 8);
        ctx.fill();
        ctx.strokeStyle = isSelf ? '#a5b4fc' : 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Online status dot
        ctx.beginPath();
        ctx.arc(pillX + 12, pillY + 13, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.name, px + 5, pillY + 18);

        // Interactive Prompt Pill (High Contrast)
        if (isSelf && promptText) {
          ctx.save();
          ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
          const promptW = ctx.measureText(promptText).width + 32;
          const promptH = 32;
          const promptX = px - promptW / 2;
          const promptY = py - 84 + walkBob;

          ctx.fillStyle = 'rgba(10, 13, 20, 0.96)';
          ctx.beginPath();
          ctx.roundRect(promptX, promptY, promptW, promptH, 10);
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.fillText(promptText, px, promptY + 21);
          ctx.restore();
        }

        // Textual Speech Bubble
        const bubble = speechBubbles.current.find((b) => b.playerId === p.id);
        if (bubble) {
          const remaining = (bubble.expiresAt - now) / 4500;
          const alpha = remaining > 0.8 ? 1 : remaining / 0.8;

          ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          const bw = Math.min(ctx.measureText(bubble.text).width + 22, 240);
          const bh = 30;
          const bx = px - bw / 2;
          const by = py - (promptText ? 104 : 76) + walkBob;

          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 10);
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(px - 6, by + bh);
          ctx.lineTo(px + 6, by + bh);
          ctx.lineTo(px + 6, by + bh + 7);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.fillText(bubble.text, px, by + 19);
          ctx.globalAlpha = 1;
        }
      });

      // ── 11. Floating Reaction Bubbles Animation ──────────────────────────
      reactionBubbles.current.forEach((rb) => {
        rb.y += rb.vy;
        const age = now - rb.birthTime;
        const progress = age / rb.duration;

        const wobbleX = rb.x + Math.sin(age * 0.006 + rb.wobblePhase) * 10;
        let scale = 1.0;
        let alpha = 1.0;

        if (progress < 0.2) {
          scale = 0.5 + (progress / 0.2) * 0.65; // Spring scale in
        } else if (progress > 0.75) {
          alpha = 1.0 - (progress - 0.75) / 0.25; // Fade out
          scale = 1.15 - (progress - 0.75) * 0.4;
        }

        ctx.save();
        ctx.translate(wobbleX, rb.y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        // Frosted Glass Emoji Capsule Bubble
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rb.emoji, 0, 1);

        ctx.restore();
      });
      reactionBubbles.current = reactionBubbles.current.filter((rb) => now - rb.birthTime < rb.duration);

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="game-canvas"
      aria-label="2D virtual office space"
      style={{ display: 'block', width: '100%', height: '100%', outline: 'none' }}
      tabIndex={0}
    />
  );
};

export default CanvasView;
