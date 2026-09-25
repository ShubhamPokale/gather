// client/src/hooks/useLiveKit.ts
// Owner: Agent 3 (Media / LiveKit). See AGENTS.md §3.
// Implements the proximity + zone-isolation formula in docs/ARCHITECTURE.md §3.2.
// If you change this logic, update that doc in the same change.

import { useEffect, useRef } from 'react';
import { Room, RemoteParticipant, RemoteTrackPublication, RemoteAudioTrack, Track } from 'livekit-client';
import mapData from '../mapData.json';
import { PlayerState } from '../types';
import { getDistance } from '../utils/math';

interface UseLiveKitParams {
  url: string | null;
  token: string | null;
  selfId: string | null;
  players: Record<string, PlayerState>;
  localPlayer: PlayerState | null;
}

const PROXIMITY_RADIUS = 150;
const PROXIMITY_INNER = 40;

export function useLiveKit({ url, token, players, localPlayer }: UseLiveKitParams) {
  const roomRef = useRef<Room | null>(null);

  // Connect once per url/token pair.
  useEffect(() => {
    if (!url || !token) return;

    // Skip connecting if these are placeholder dev credentials
    if (url === 'wss://your-project.livekit.cloud') {
      console.info('[LiveKit] Skipping connection: placeholder URL detected. Set real credentials in server/.env to enable A/V.');
      return;
    }

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    (async () => {
      try {
        await room.connect(url, token);
        await room.localParticipant.enableCameraAndMicrophone();
      } catch (err) {
        console.error('Failed to connect to LiveKit:', err);
      }
    })();

    return () => {
      room.disconnect();
    };
  }, [url, token]);

  // Recompute per-peer gain/subscription whenever positions change.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !localPlayer) return;

    const localZoneMeta = mapData.zones.find((z) => z.id === localPlayer.zoneId);

    room.remoteParticipants.forEach((participant: RemoteParticipant) => {
      const peerState = players[participant.identity];
      if (!peerState) return;

      const peerZoneMeta = mapData.zones.find((z) => z.id === peerState.zoneId);
      const dist = getDistance(localPlayer.x, localPlayer.y, peerState.x, peerState.y);

      let shouldHear = false;
      let gain = 0;

      // §3.2 — evaluated in order:
      if ((peerZoneMeta as { isBroadcast?: boolean } | undefined)?.isBroadcast) {
        // 1. Podium/stage: full gain to everyone.
        shouldHear = true;
        gain = 1.0;
      } else if (localZoneMeta?.isolatedAudio || peerZoneMeta?.isolatedAudio) {
        // 2. Either side in a private room: only same zone hears each other.
        if (localPlayer.zoneId === peerState.zoneId) {
          shouldHear = true;
          gain = 1.0;
        }
      } else if (dist <= PROXIMITY_RADIUS) {
        // 3. Open space: distance falloff.
        shouldHear = true;
        const clamped = Math.max(0, dist - PROXIMITY_INNER);
        const range = PROXIMITY_RADIUS - PROXIMITY_INNER;
        gain = dist <= PROXIMITY_INNER ? 1.0 : Math.pow(1 - clamped / range, 2);
      }

      // Video subscription (§3.3)
      const videoSubscribe = dist < 150 && shouldHear;

      participant.trackPublications.forEach((pub: RemoteTrackPublication) => {
        if (pub.kind === Track.Kind.Audio) {
          // livekit-client v2: volume is set on the AudioTrack element
          if (pub.audioTrack) {
            (pub.audioTrack as RemoteAudioTrack).setVolume(gain);
          }
        }
        if (pub.kind === Track.Kind.Video) {
          pub.setSubscribed(videoSubscribe);
        }
      });
    });
  }, [players, localPlayer]);

  return { room: roomRef.current };
}
