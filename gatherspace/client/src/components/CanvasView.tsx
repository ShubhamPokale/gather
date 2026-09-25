// client/src/components/CanvasView.tsx
// High-fidelity 2D Spatial Office Canvas with Warm Flooring, Furniture & Micro-animations.

import React, { useRef, useEffect, useCallback } from 'react';
import mapData from '../mapData.json';
import { PlayerState, Direction } from '../types';
import { resolveMovement, getPlayerZone } from '../utils/math';

interface SpeechBubble {
  playerId: string;
  text: string;
  expiresAt: number;
}

interface CanvasViewProps {
  localPlayer: PlayerState;
  players: Record<string, PlayerState>;
  selfId: string;
  onMove: (pos: { x: number; y: number; dir: Direction; isMoving: boolean; zoneId: string | null }) => void;
  onInteractPrompt?: (prompt: string | null, action?: () => void) => void;
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

export const CanvasView: React.FC<CanvasViewProps> = ({ localPlayer, players, selfId, onMove, onInteractPrompt }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysDown = useRef<Set<string>>(new Set());
  const clickTarget = useRef<{ x: number; y: number } | null>(null);
  const localPos = useRef({ x: localPlayer.x, y: localPlayer.y, dir: localPlayer.dir as Direction, walkFrame: 0 });
  const speechBubbles = useRef<SpeechBubble[]>([]);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onInteractPromptRef = useRef(onInteractPrompt);
  onInteractPromptRef.current = onInteractPrompt;

  // Resize canvas to container
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

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        keysDown.current.add(key);
        clickTarget.current = null;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysDown.current.delete(e.key.toLowerCase());

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Click to move
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const W = canvas.width;
      const H = canvas.height;
      const camX = Math.max(0, Math.min(mapData.world.width - W, localPos.current.x - W / 2));
      const camY = Math.max(0, Math.min(mapData.world.height - H, localPos.current.y - H / 2));

      clickTarget.current = {
        x: e.clientX - rect.left + camX,
        y: e.clientY - rect.top + camY,
      };
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, []);

  const addSpeechBubble = useCallback((playerId: string, text: string) => {
    speechBubbles.current = speechBubbles.current.filter((b) => b.playerId !== playerId);
    speechBubbles.current.push({ playerId, text, expiresAt: Date.now() + 4000 });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { playerId, text } = (e as CustomEvent).detail;
      addSpeechBubble(playerId, text);
    };
    window.addEventListener('gatherspace:speech', handler);
    return () => window.removeEventListener('gatherspace:speech', handler);
  }, [addSpeechBubble]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const SPEED = 3.8;

    const remoteInterp: Record<string, { x: number; y: number; walkFrame: number }> = {};

    const render = () => {
      // ── Movement Input ──────────────────────────────────────────────────
      let dx = 0;
      let dy = 0;
      let dir = localPos.current.dir;

      if (keysDown.current.has('w') || keysDown.current.has('arrowup')) { dy -= SPEED; dir = 'up'; }
      if (keysDown.current.has('s') || keysDown.current.has('arrowdown')) { dy += SPEED; dir = 'down'; }
      if (keysDown.current.has('a') || keysDown.current.has('arrowleft')) { dx -= SPEED; dir = 'left'; }
      if (keysDown.current.has('d') || keysDown.current.has('arrowright')) { dx += SPEED; dir = 'right'; }

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
        localPos.current.walkFrame += 0.2;
        const zoneId = getPlayerZone(resolved.x, resolved.y);
        onMoveRef.current({ x: resolved.x, y: resolved.y, dir, isMoving, zoneId });
      } else if (clickTarget.current) {
        const cdx = clickTarget.current.x - localPos.current.x;
        const cdy = clickTarget.current.y - localPos.current.y;
        const dist = Math.hypot(cdx, cdy);

        if (dist > 4) {
          isMoving = true;
          const stepX = (cdx / dist) * SPEED;
          const stepY = (cdy / dist) * SPEED;

          if (Math.abs(cdx) > Math.abs(cdy)) {
            dir = cdx > 0 ? 'right' : 'left';
          } else {
            dir = cdy > 0 ? 'down' : 'up';
          }

          const resolved = resolveMovement(localPos.current.x, localPos.current.y, stepX, stepY);
          localPos.current.x = resolved.x;
          localPos.current.y = resolved.y;
          localPos.current.dir = dir;
          localPos.current.walkFrame += 0.2;
          const zoneId = getPlayerZone(resolved.x, resolved.y);
          onMoveRef.current({ x: resolved.x, y: resolved.y, dir, isMoving, zoneId });
        } else {
          clickTarget.current = null;
        }
      }

      // Check interactables prompt
      if (onInteractPromptRef.current && mapData.interactables) {
        let activePrompt: string | null = null;
        for (const item of mapData.interactables) {
          const dist = Math.hypot(localPos.current.x - item.x, localPos.current.y - item.y);
          if (dist <= item.radius) {
            activePrompt = item.prompt;
            break;
          }
        }
        onInteractPromptRef.current(activePrompt);
      }

      const W = canvas.width;
      const H = canvas.height;

      // Camera: clamp within world bounds
      const camX = Math.max(0, Math.min(mapData.world.width - W, localPos.current.x - W / 2));
      const camY = Math.max(0, Math.min(mapData.world.height - H, localPos.current.y - H / 2));

      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.translate(-camX, -camY);

      // ── 1. Hallway Floor (Warm Oak Wood Planks) ─────────────────────────
      ctx.fillStyle = '#1e1a17';
      ctx.fillRect(0, 0, mapData.world.width, mapData.world.height);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1.5;
      for (let py = 0; py < mapData.world.height; py += 32) {
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(mapData.world.width, py);
        ctx.stroke();
      }
      for (let px = 0; px < mapData.world.width; px += 96) {
        for (let py = 0; py < mapData.world.height; py += 64) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + 32);
          ctx.stroke();
        }
      }

      // ── 2. Zones with Rich Floor Textures ──────────────────────────────
      mapData.zones.forEach((zone) => {
        ctx.save();
        ctx.fillStyle = zone.color;
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

        if (zone.floorType === 'parquet') {
          // Warm Parquet in Reception
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1.5;
          for (let py = zone.y; py < zone.y + zone.h; py += 28) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
          ctx.lineWidth = 3;
          ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

          // Central Welcome Rug
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(zone.x + 120, zone.y + 140, zone.w - 240, zone.h - 200, 24);
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (zone.floorType === 'tiles') {
          // Modern polished ash tile in Coworking floor
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = 2;
          for (let px = zone.x; px < zone.x + zone.w; px += 60) {
            ctx.beginPath(); ctx.moveTo(px, zone.y); ctx.lineTo(px, zone.y + zone.h); ctx.stroke();
          }
          for (let py = zone.y; py < zone.y + zone.h; py += 60) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
          ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
          ctx.fillRect(zone.x + 80, zone.y + 100, zone.w - 160, zone.h - 180);
        } else if (zone.floorType === 'carpet_navy' || zone.floorType === 'carpet_emerald') {
          // Executive Woven Carpet with Gold Border
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.lineWidth = 2;
          for (let py = zone.y; py < zone.y + zone.h; py += 12) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
          ctx.strokeStyle = zone.floorType === 'carpet_navy' ? 'rgba(99, 102, 241, 0.5)' : 'rgba(16, 185, 129, 0.5)';
          ctx.lineWidth = 3;
          ctx.strokeRect(zone.x + 8, zone.y + 8, zone.w - 16, zone.h - 16);
        } else if (zone.floorType === 'terracotta') {
          // Terracotta Café Tiles
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.lineWidth = 2;
          for (let px = zone.x; px < zone.x + zone.w; px += 36) {
            ctx.beginPath(); ctx.moveTo(px, zone.y); ctx.lineTo(px, zone.y + zone.h); ctx.stroke();
          }
          for (let py = zone.y; py < zone.y + zone.h; py += 36) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
        } else if (zone.floorType === 'stage_wood') {
          // Stage Floor with Spotlight
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
          ctx.lineWidth = 4;
          ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

          ctx.fillStyle = '#831843';
          ctx.fillRect(zone.x + zone.w / 2 - 40, zone.y + 120, 80, zone.h - 140);

          const grad = ctx.createRadialGradient(zone.x + zone.w / 2, zone.y + 200, 20, zone.x + zone.w / 2, zone.y + 200, 260);
          grad.addColorStop(0, 'rgba(250, 204, 21, 0.22)');
          grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        } else if (zone.floorType === 'blueprint') {
          // Blueprint drafting grid
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
          ctx.lineWidth = 1;
          for (let px = zone.x; px < zone.x + zone.w; px += 24) {
            ctx.beginPath(); ctx.moveTo(px, zone.y); ctx.lineTo(px, zone.y + zone.h); ctx.stroke();
          }
          for (let py = zone.y; py < zone.y + zone.h; py += 24) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
        } else if (zone.floorType === 'arcade_grid') {
          // Arcade grid
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
          ctx.lineWidth = 1.5;
          for (let px = zone.x; px < zone.x + zone.w; px += 40) {
            ctx.beginPath(); ctx.moveTo(px, zone.y); ctx.lineTo(px, zone.y + zone.h); ctx.stroke();
          }
          for (let py = zone.y; py < zone.y + zone.h; py += 40) {
            ctx.beginPath(); ctx.moveTo(zone.x, py); ctx.lineTo(zone.x + zone.w, py); ctx.stroke();
          }
        }

        // Room Wall Plaque Signage
        const plaqueW = 240;
        const plaqueH = 26;
        const plaqueX = zone.x + 30;
        const plaqueY = zone.y + 12;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(plaqueX, plaqueY, plaqueW, plaqueH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = '700 11px Inter, sans-serif';
        ctx.fillStyle = '#f1f5f9';
        ctx.textAlign = 'left';
        ctx.fillText(zone.label, plaqueX + 12, plaqueY + 17);

        ctx.restore();
      });

      // ── 3. Walls & Colliders with 3D Drop Shadows ───────────────────────
      mapData.colliders.forEach((c) => {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(c.x + 5, c.y + 5, c.w, c.h);

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x, c.y, c.w, c.h);
        ctx.restore();
      });

      // ── 4. Detailed Office Furniture ────────────────────────────────────
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

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(obs.x + 10, obs.y + 10, obs.w - 20, obs.h - 20, 10);
          ctx.fill();

          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(obs.x + obs.w / 2 - 25, obs.y + 20, 50, 6);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(obs.x + obs.w / 2 - 15, obs.y + 32, 30, 12);
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(obs.x + obs.w / 2 + 55, obs.y + 36, 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = 'bold 11px Inter, sans-serif';
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

          ctx.fillStyle = '#16120e';
          ctx.beginPath();
          ctx.roundRect(obs.x + 35, obs.y + 28, obs.w - 70, obs.h - 56, 12);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(obs.x + obs.w / 2, obs.y + obs.h / 2, 14, 0, Math.PI * 2);
          ctx.fillStyle = '#334155';
          ctx.fill();
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#0284c7';
          ctx.fillRect(obs.x + 70, obs.y + 40, 24, 4);
          ctx.fillRect(obs.x + obs.w - 94, obs.y + 40, 24, 4);

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

          // Dual curved monitors with code highlighting
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(obs.x + 22, obs.y + 14, 46, 6);
          ctx.fillStyle = '#8b5cf6';
          ctx.fillRect(obs.x + 76, obs.y + 14, 46, 6);

          ctx.fillStyle = '#0284c7';
          ctx.fillRect(obs.x + 158, obs.y + 14, 46, 6);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(obs.x + 212, obs.y + 14, 46, 6);

          ctx.fillStyle = '#0f172a';
          ctx.fillRect(obs.x + 50, obs.y + 30, 32, 14);
          ctx.fillRect(obs.x + 186, obs.y + 30, 32, 14);

          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(obs.x + 115, obs.y + 36, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#64748b';
          ctx.beginPath();
          ctx.arc(obs.x + 66, obs.y + obs.h + 10, 10, 0, Math.PI * 2);
          ctx.arc(obs.x + 202, obs.y + obs.h + 10, 10, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = '600 10px Inter, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(obs.label, obs.x + 14, obs.y + obs.h - 12);
        } else if (obs.type === 'whiteboard_item') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(obs.x + 6, obs.y + 8, obs.w, obs.h);

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8);
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(obs.x + 8, obs.y + 8, obs.w - 16, obs.h - 16, 4);
          ctx.fill();

          ctx.fillStyle = '#fef08a';
          ctx.fillRect(obs.x + 16, obs.y + 14, 18, 18);
          ctx.fillStyle = '#bbf7d0';
          ctx.fillRect(obs.x + 40, obs.y + 14, 18, 18);
          ctx.fillStyle = '#fecdd3';
          ctx.fillRect(obs.x + 64, obs.y + 14, 18, 18);

          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText('COLLABORATIVE WHITEBOARD', obs.x + 92, obs.y + 30);
        } else if (obs.type === 'coffee_bar') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(obs.x + 6, obs.y + 8, obs.w, obs.h);

          ctx.fillStyle = '#3e2723';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 10);
          ctx.fill();
          ctx.strokeStyle = '#8d6e63';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(obs.x + 25, obs.y + 16, 55, 30);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(obs.x + 32, obs.y + 20, 8, 8);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(obs.x + 70, obs.y + 28, 4, 14);

          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillStyle = '#fef3c7';
          ctx.fillText('☕ CHAI & ESPRESSO BAR', obs.x + 95, obs.y + 42);
        } else if (obs.type === 'podium_stand') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(obs.x + 4, obs.y + 6, obs.w, obs.h);

          ctx.fillStyle = '#4a044e';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8);
          ctx.fill();
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(obs.x + obs.w / 2, obs.y + 12);
          ctx.lineTo(obs.x + obs.w / 2 - 6, obs.y - 6);
          ctx.stroke();

          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillStyle = '#f3e8ff';
          ctx.fillText('📢 PODIUM', obs.x + 18, obs.y + 36);
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
        } else if (obs.type === 'lounge_sofa') {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(obs.x + 6, obs.y + 8, obs.w, obs.h);

          ctx.fillStyle = '#1e1b4b';
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 18);
          ctx.fill();
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#312e81';
          ctx.fillRect(obs.x + 15, obs.y + 12, 60, obs.h - 24);
          ctx.fillRect(obs.x + 85, obs.y + 12, 60, obs.h - 24);
          ctx.fillRect(obs.x + 155, obs.y + 12, 60, obs.h - 24);

          ctx.font = '600 11px Inter, sans-serif';
          ctx.fillStyle = '#c7d2fe';
          ctx.fillText('🛋️ RELAX LOUNGE', obs.x + 20, obs.y + obs.h / 2 + 4);
        }
        ctx.restore();
      });

      // ── 5. Biophilic Tropical Plants ────────────────────────────────────
      PLANTS.forEach((p) => {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(p.x + 4, p.y + 6, p.r, p.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = '#166534';
        ctx.fill();
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
          const lx = p.x + Math.cos(a) * (p.r * 0.7);
          const ly = p.y + Math.sin(a) * (p.r * 0.7);
          ctx.beginPath();
          ctx.arc(lx, ly, p.r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // ── 6. Spatial Proximity Radar Ring (Local Player) ─────────────────
      ctx.beginPath();
      ctx.arc(localPos.current.x, localPos.current.y, 165, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
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

      // ── 7. Players Rendering ───────────────────────────────────────────
      const now = Date.now();
      speechBubbles.current = speechBubbles.current.filter((b) => b.expiresAt > now);

      Object.values(players).forEach((p) => {
        const isSelf = p.id === selfId;

        let px: number;
        let py: number;
        let walkFrame = 0;

        if (isSelf) {
          px = localPos.current.x;
          py = localPos.current.y;
          walkFrame = localPos.current.walkFrame;
        } else {
          const interp = remoteInterp[p.id] ?? { x: p.x, y: p.y, walkFrame: 0 };
          interp.x += (p.x - interp.x) * 0.2;
          interp.y += (p.y - interp.y) * 0.2;
          if (p.isMoving) interp.walkFrame += 0.18;
          remoteInterp[p.id] = interp;
          px = interp.x;
          py = interp.y;
          walkFrame = interp.walkFrame;
        }

        const playerDir = isSelf ? localPos.current.dir : p.dir;
        const walkBob = (isSelf ? isMoving : p.isMoving) ? Math.sin(walkFrame) * 2 : 0;

        // Shadow
        ctx.beginPath();
        ctx.ellipse(px, py + 14, 14, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
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
          ctx.fillRect(px - 5, py - 8 + walkBob, 2.5, 3.5);
        } else if (playerDir === 'right') {
          ctx.fillRect(px + 3, py - 8 + walkBob, 2.5, 3.5);
        } else if (playerDir !== 'up') {
          ctx.fillRect(px - 4, py - 8 + walkBob, 2.5, 3.5);
          ctx.fillRect(px + 2, py - 8 + walkBob, 2.5, 3.5);
        }

        // Nametag pill
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        const textWidth = ctx.measureText(p.name).width;
        const pillW = textWidth + 18;
        const pillH = 20;
        const pillX = px - pillW / 2;
        const pillY = py - 38 + walkBob;

        ctx.fillStyle = isSelf ? 'rgba(99, 102, 241, 0.88)' : 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 8);
        ctx.fill();
        ctx.strokeStyle = isSelf ? '#a5b4fc' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.name, px, pillY + 14);

        // Speech bubble
        const bubble = speechBubbles.current.find((b) => b.playerId === p.id);
        if (bubble) {
          const remaining = (bubble.expiresAt - now) / 4000;
          const alpha = remaining > 0.8 ? 1 : remaining / 0.8;

          ctx.font = '400 12px Inter, sans-serif';
          ctx.textAlign = 'center';
          const bw = Math.min(ctx.measureText(bubble.text).width + 20, 220);
          const bh = 28;
          const bx = px - bw / 2;
          const by = py - 74 + walkBob;

          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 8);
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
          ctx.fillText(bubble.text, px, by + 18);
          ctx.globalAlpha = 1;
        }
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [players, selfId]);

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
