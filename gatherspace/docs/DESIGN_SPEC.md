# GatherSpace — Design Specification

## 1. Aesthetic direction

Modern dark-office glassmorphism: a deep-slate canvas world with clean,
translucent UI chrome floating above it. Retro top-down spatial ergonomics,
not pixel-art nostalgia — the world should read as a real, current product,
not a demo.

## 2. Color tokens

| Token | Value | Use |
|---|---|---|
| Canvas background | `#0b0f19` | World backdrop outside zones |
| Grid line | `#1e293b` | Floor grid |
| Surface / glass | `rgba(18, 24, 38, 0.75)` + `backdrop-filter: blur(16px)` | Top ribbon, side deck, dock |
| Border accent | `rgba(255, 255, 255, 0.08)` | Glass panel edges |
| Primary accent | `#6366f1` (indigo) | Buttons, proximity ring |
| Secondary accent | `#a855f7` (purple) | Secondary highlights |
| Boardroom A | `#4f46e5` | Zone fill/border |
| Boardroom B | `#10b981` | Zone fill/border |
| Stage / podium | `#f59e0b` | Zone fill/border |
| Coffee lounge | `#f43f5e` | Zone fill/border |

Zone fills use the border color at low opacity (10–15%), per
`mapData.json`'s `color` field.

## 3. Typography

- UI text: `Inter`, fallback `SF Pro Display, system-ui, sans-serif`.
- Coordinates / debug / ping metrics: `JetBrains Mono`, fallback `Fira Code`.
- Nametag pills: 11px, 500 weight, white on `rgba(0,0,0,0.6–0.75)` pill.
- Zone labels: 13px, 600 weight, drawn in the zone's border color.

## 4. Avatar spec

- Body: filled circle, radius 16px, user-chosen accent color, 2px stroke
  (white if local player, black otherwise).
- Facing indicator: a small white dot offset 8px from center in the facing
  direction (up/down/left/right) — not a full sprite sheet for v1.
- Overhead nametag: pill background, name text, positioned ~32px above the
  avatar center.
- No custom hair/outfit sprite art in v1 — color is the only avatar
  differentiator. (Hair color field exists in the type contract for v1.1.)

## 5. Interaction indicators

- Proximity ring: dashed circle, radius 140–150px, `rgba(99,102,241,0.25)`,
  centered on the local player, always visible (not just when stationary,
  for v1 — simplifies the render loop).
- Zone entry: a toast banner, e.g. "Entered: Executive Boardroom — audio
  isolated," shown for ~2s on zone change.
- Speech bubbles: appear above a player's head for ~4s after they send a
  spatial chat message.

## 6. Layout

```
┌──────────────────────────────────────────────────────────┐
│ Top glass ribbon: proximity video tiles (you + nearby)   │
├───────────────────────────────────────────┬──────────────┤
│                                           │  Mini-map    │
│              CANVAS 2D VIEWPORT           ├──────────────┤
│   avatars, zones, furniture, speech       │  Side deck:  │
│   bubbles, proximity ring                 │  Chat/People │
├───────────────────────────────────────────┴──────────────┤
│ Bottom action dock: Mic | Cam | Screen | Emote            │
└────────────────────────────────────────────────────────────┘
```

## 7. What v1 deliberately skips visually

- No custom furniture/character sprite art — solid-fill rectangles and
  circles only. Swap in art later without changing any layout logic.
- No animations beyond CSS transitions on toasts/panels and the canvas
  render loop itself.
- No theming/light-mode — dark only.
