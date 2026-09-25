// client/src/utils/math.ts
// Owner: Agent 2 (Frontend Engine & Canvas). See AGENTS.md §3.
// Reads mapData.json as the single source of truth for world/collision/zones.

import mapData from '../mapData.json';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function checkAABBCollision(circle: { x: number; y: number; r: number }, rect: Box): boolean {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.r * circle.r;
}

export function resolveMovement(
  currentX: number,
  currentY: number,
  dx: number,
  dy: number,
  radius: number = 16
): { x: number; y: number } {
  let targetX = currentX + dx;
  let targetY = currentY + dy;

  targetX = Math.max(radius, Math.min(mapData.world.width - radius, targetX));
  targetY = Math.max(radius, Math.min(mapData.world.height - radius, targetY));

  const colliders: Box[] = [
    ...mapData.colliders,
    ...mapData.furniture.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })),
  ];

  let collisionX = false;
  for (const box of colliders) {
    if (checkAABBCollision({ x: targetX, y: currentY, r: radius }, box)) {
      collisionX = true;
      break;
    }
  }
  const finalX = collisionX ? currentX : targetX;

  let collisionY = false;
  for (const box of colliders) {
    if (checkAABBCollision({ x: finalX, y: targetY, r: radius }, box)) {
      collisionY = true;
      break;
    }
  }
  const finalY = collisionY ? currentY : targetY;

  return { x: finalX, y: finalY };
}

export function getPlayerZone(x: number, y: number): string | null {
  for (const zone of mapData.zones) {
    if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
      return zone.id;
    }
  }
  return null;
}

export function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}
