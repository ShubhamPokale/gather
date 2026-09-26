// client/src/components/MiniMap.tsx
// Renders a high-resolution scaled-down overview of the 2D office world with zone fills,
// player radar blips, hover room tooltips, and interactive click-to-teleport.

import React, { useEffect, useRef, useState } from 'react';
import { PlayerState } from '../types';
import mapData from '../mapData.json';

interface MiniMapProps {
  players: Record<string, PlayerState>;
  selfId: string | null;
  localPlayer: PlayerState | null;
  onTeleport?: (x: number, y: number, zoneLabel?: string) => void;
}

export const MiniMap: React.FC<MiniMapProps> = ({ players, selfId, localPlayer, onTeleport }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let pulse = 0;

    const render = () => {
      pulse += 0.05;
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
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });

      // Local Player Blip with Pulsing Radar Ring
      if (localPlayer) {
        const px = localPlayer.x * scaleX;
        const py = localPlayer.y * scaleY;

        // Radar wave pulse
        const pulseR = 5 + Math.sin(pulse) * 3;
        ctx.beginPath();
        ctx.arc(px, py, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [players, selfId, localPlayer]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onTeleport) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = mapData.world.width / canvas.width;
    const scaleY = mapData.world.height / canvas.height;

    const targetWorldX = clickX * scaleX;
    const targetWorldY = clickY * scaleY;

    // Find clicked zone
    const zone = mapData.zones.find(
      (z) =>
        targetWorldX >= z.x &&
        targetWorldX <= z.x + z.w &&
        targetWorldY >= z.y &&
        targetWorldY <= z.y + z.h
    );

    onTeleport(targetWorldX, targetWorldY, zone ? zone.label : 'Office Corridor');
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = mapData.world.width / canvas.width;
    const scaleY = mapData.world.height / canvas.height;

    const targetWorldX = clickX * scaleX;
    const targetWorldY = clickY * scaleY;

    const zone = mapData.zones.find(
      (z) =>
        targetWorldX >= z.x &&
        targetWorldX <= z.x + z.w &&
        targetWorldY >= z.y &&
        targetWorldY <= z.y + z.h
    );

    setHoveredZone(zone ? zone.label : null);
  };

  return (
    <div
      className="glass-card"
      style={{
        position: 'relative',
        borderRadius: 16,
        padding: 6,
        border: '1px solid rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
        cursor: 'crosshair',
      }}
      title="Click anywhere on MiniMap to Teleport"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: '#f8fafc' }}>
          <i className="fas fa-map-location-dot text-sky-400"></i> SPATIAL MAP
        </div>
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 9999, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontWeight: 600 }}>
          ⚡ Click to Warp
        </span>
      </div>

      <canvas
        ref={canvasRef}
        width={184}
        height={132}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredZone(null)}
        style={{ display: 'block', borderRadius: 10 }}
        aria-label="Interactive Spatial Mini-map"
      />

      {hoveredZone && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            right: 10,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.5)',
            borderRadius: 6,
            padding: '3px 6px',
            fontSize: 10,
            fontWeight: 700,
            color: '#38bdf8',
            textAlign: 'center',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          Teleport to {hoveredZone}
        </div>
      )}
    </div>
  );
};

export default MiniMap;
