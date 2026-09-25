# GatherSpace — Product Specification (v1 / "ship tonight")

## 1. Problem & solution

Video conferencing tools compartmentalize conversation into scheduled
blocks and kill spontaneous "water-cooler" interaction. GatherSpace is an
in-browser 2D spatial office: walk up to a colleague to start talking, step
into a private room for confidential work, or take the podium to broadcast
to everyone.

## 2. Personas

| Persona | Role | Goal | Solves |
|---|---|---|---|
| Async Remote Dev | Engineer | Co-work silently, spot who's free, chat ad hoc | No more "quick call?" pings |
| Virtual Event Organizer | HR / Community lead | Run all-hands and mixers with no setup for guests | Replaces static webinars |
| Guest Attendee | Client / interviewee | Join instantly via one URL, no account | Zero-friction onboarding |

## 3. Core user flow

```
Join link (/?room=office-1)
  → Onboarding modal: name, avatar color, mic/cam permission
  → Enter space
      → Move (WASD / arrows)
      → Proximity → auto audio/video with nearby players
      → Enter private room → audio isolates to room members
      → Step on podium → broadcast to entire map
```

## 4. Scope — MoSCoW

**Must-have (v1, ship tonight)**
- Top-down canvas engine, camera-follow, deterministic collision.
- Spatial audio/video proximity (distance-based gain falloff).
- LiveKit-based media (SFU), not raw mesh.
- Private zones with strict audio isolation.
- Spatial chat + global chat + overhead speech bubbles.

**Should-have (v1.1, if time remains)**
- Mini-map with live player markers.
- Podium/broadcast zone.
- "Ghost mode" to walk through crowds.

**Could-have (v2)**
- Persistent map editor.
- Screen sharing in private rooms / on stage.
- Calendar integration for ad-hoc room booking.

**Won't-have (v1)**
- Full 3D/VR (WebXR).
- Any crypto/NFT mechanics.
- Accounts, login, saved profiles, database persistence.

## 5. Why no database tonight

Room state, player positions, and chat are transient — if the server
restarts, people refresh and rejoin. Adding Postgres/Redis tonight buys
persistence nobody asked for yet, at the cost of migrations, connection
pooling, and another deploy target. Revisit only if users ask to keep
rooms/history across restarts.

## 6. Success criteria for tonight

- A stranger can open the link, join, see themselves and others moving,
  and hear/see people who walk near them, with no setup on their end.
- Two people can enter a "private room" box and talk without the rest of
  the map hearing them.
- The app survives ~10–15 concurrent users without audio degrading (this is
  why LiveKit/SFU was chosen over mesh — see `ARCHITECTURE.md §3`).
