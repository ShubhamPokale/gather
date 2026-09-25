// client/src/components/CanvasView.tsx
// Owner: Agent 2 (Frontend Engine & Canvas). See AGENTS.md §3.
// Input handling, collision (via utils/math.ts), camera-follow, rendering.
// Visual tokens come from docs/DESIGN_SPEC.md — keep colors/sizes in sync.

import React, { useRef, useEffect } from 'react';
import mapData from '../mapData.json';
import { PlayerState, Direction } from '../types';
import { resolveMovement, getPlayerZone } from '../utils/math';

interface CanvasViewProps {
  localPlayer: PlayerState;
  players: Record<string, PlayerState>;
  onMove: (pos: { x: number; y: number; dir: Direction; isMoving: boolean; zoneId: string | null }) => void;
}

export const CanvasView: React.FC<CanvasViewProps> = ({ localPlayer, players, onMove }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysDown = useRef<Set<string>>(new Set());
  const localPos = useRef({ x: localPlayer.x, y: localPlayer.y, dir: localPlayer.dir });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
        keysDown.current.add(e.key.toLowerCase());
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const SPEED = 3.5;

    const render = () => {
      let dx = 0;
      let dy = 0;
      let dir = localPos.current.dir;

      if (keysDown.current.has('w') || keysDown.current.has('arrowup')) { dy -= SPEED; dir = 'up'; }
      if (keysDown.current.has('s') || keysDown.current.has('arrowdown')) { dy += SPEED; dir = 'down'; }
      if (keysDown.current.has('a') || keysDown.current.has('arrowleft')) { dx -= SPEED; dir = 'left'; }
      if (keysDown.current.has('d') || keysDown.current.has('arrowright')) { dx += SPEED; dir = 'right'; }

      const isMoving = dx !== 0 || dy !== 0;

      if (isMoving) {
        const resolved = resolveMovement(localPos.current.x, localPos.current.y, dx, dy);
        localPos.current.x = resolved.x;
        localPos.current.y = resolved.y;
        localPos.current.dir = dir;

        const zoneId = getPlayerZone(resolved.x, resolved.y);
        onMove({ x: resolved.x, y: resolved.y, dir, isMoving, zoneId });
      }

      const camX = localPos.current.x - canvas.width / 2;
      const camY = localPos.current.y - canvas.height / 2;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(-camX, -camY);

      // Background
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, mapData.world.width, mapData.world.height);

      // Grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const GRID_SIZE = 40;
      for (let x = 0; x < mapData.world.width; x += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapData.world.height); ctx.stroke();
      }
      for (let y = 0; y < mapData.world.height; y += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(mapData.world.width, y); ctx.stroke();
      }

      // Zones
      mapData.zones.forEach((zone) => {
        ctx.fillStyle = zone.color;
        ctx.strokeStyle = zone.borderColor;
        ctx.lineWidth = 2;
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

        ctx.fillStyle = zone.borderColor;
        ctx.font = '600 13px Inter, sans-serif';
        ctx.fillText(zone.label.toUpperCase(), zone.x + 12, zone.y + 24);
      });

      // Furniture
      mapData.furniture.forEach((item) => {
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.strokeRect(item.x, item.y, item.w, item.h);
      });

      // Local proximity ring
      ctx.beginPath();
      ctx.arc(localPos.current.x, localPos.current.y, 150, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Players
      Object.values(players).forEach((p) => {
        const isSelf = p.id === localPlayer.id;
        const px = isSelf ? localPos.current.x : p.x;
        const py = isSelf ? localPos.current.y : p.y;

        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isSelf ? '#ffffff' : '#000000';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        let eyeX = px;
        let eyeY = py;
        if (p.dir === 'up') eyeY -= 8;
        if (p.dir === 'down') eyeY += 8;
        if (p.dir === 'left') eyeX -= 8;
        if (p.dir === 'right') eyeX += 8;
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '500 11px Inter, sans-serif';
        const textWidth = ctx.measureText(p.name).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(px - textWidth / 2 - 6, py - 32, textWidth + 12, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.name, px - textWidth / 2, py - 19);
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [players, localPlayer.id, onMove]);

  return <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="block w-full h-full" />;
};
