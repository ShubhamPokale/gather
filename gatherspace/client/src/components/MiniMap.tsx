// client/src/components/MiniMap.tsx
// Renders a high-resolution scaled-down overview of the 2D office world with zone fills and player radar blips.

import React, { useEffect, useRef } from 'react';
import { PlayerState } from '../types';
import mapData from '../mapData.json';

interface MiniMapProps {
  players: Record<string, PlayerState>;
  selfId: string | null;
  localPlayer: PlayerState | null;
}

export const MiniMap: React.FC<MiniMapProps> = ({ players, selfId, localPlayer }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const scaleX = W / mapData.world.width;
    const scaleY = H / mapData.world.height;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Zones
    mapData.zones.forEach((zone) => {
      ctx.fillStyle = zone.color;
      ctx.fillRect(zone.x * scaleX, zone.y * scaleY, zone.w * scaleX, zone.h * scaleY);
      ctx.strokeStyle = zone.borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(zone.x * scaleX, zone.y * scaleY, zone.w * scaleX, zone.h * scaleY);
    });

    // Walls / Colliders
    ctx.fillStyle = '#475569';
    mapData.colliders.forEach((c) => {
      ctx.fillRect(c.x * scaleX, c.y * scaleY, c.w * scaleX, c.h * scaleY);
    });

    // Remote Players
    Object.values(players).forEach((p) => {
      if (p.id === selfId) return;
      const px = p.x * scaleX;
      const py = p.y * scaleY;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });

    // Local Player Blip
    if (localPlayer) {
      const px = localPlayer.x * scaleX;
      const py = localPlayer.y * scaleY;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }, [players, selfId, localPlayer]);

  return (
    <canvas
      ref={canvasRef}
      width={176}
      height={128}
      className="w-full h-full block rounded-lg"
      aria-label="Spatial Mini-map"
    />
  );
};

export default MiniMap;
