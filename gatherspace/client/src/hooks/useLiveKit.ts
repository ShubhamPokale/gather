// client/src/hooks/useLiveKit.ts
// Robust Real-Time Proximity Video & Audio Engine with LiveKit Cloud integration,
// Local Media Stream Fallback, and Web Audio Voice Activity Detection.

import { useEffect, useRef, useState, useCallback } from 'react';
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

export interface ProximityPeer {
  id: string;
  name: string;
  color: string;
  distance: number;
  gain: number;
  inSameRoom: boolean;
  isBroadcast: boolean;
  canHear: boolean;
  canSee: boolean;
}

const PROXIMITY_RADIUS = 165;
const PROXIMITY_INNER = 45;

export function useLiveKit({ url, token, players, localPlayer }: UseLiveKitParams) {
  const roomRef = useRef<Room | null>(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenOn, setIsScreenOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [proximityPeers, setProximityPeers] = useState<Record<string, ProximityPeer>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize Local Media Stream
  const getOrCreateLocalStream = async (video: boolean, audio: boolean): Promise<MediaStream | null> => {
    try {
      if (localStreamRef.current) {
        // If we already have tracks, enable/disable them
        const vTracks = localStreamRef.current.getVideoTracks();
        vTracks.forEach((t) => (t.enabled = video));
        const aTracks = localStreamRef.current.getAudioTracks();
        aTracks.forEach((t) => (t.enabled = audio));
        return localStreamRef.current;
      }

      if (!video && !audio) return null;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 24 } } : false,
        audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Setup audio analyzer for voice activity detection
      if (audio && stream.getAudioTracks().length > 0) {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioContextRef.current = ctx;
            const src = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            analyserRef.current = analyser;

            const buffer = new Uint8Array(analyser.frequencyBinCount);
            const checkVolume = () => {
              if (analyserRef.current) {
                analyserRef.current.getByteFrequencyData(buffer);
                let sum = 0;
                for (let i = 0; i < buffer.length; i++) sum += buffer[i];
                const avg = sum / buffer.length;
                setIsSpeaking(avg > 18);
              }
              animFrameRef.current = requestAnimationFrame(checkVolume);
            };
            checkVolume();
          }
        } catch {}
      }

      return stream;
    } catch (err) {
      console.warn('[Media] MediaDevices request notice:', err);
      return null;
    }
  };

  // Toggle Microphone
  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    const nextState = !isMicOn;

    if (room && room.localParticipant) {
      try {
        await room.localParticipant.setMicrophoneEnabled(nextState);
      } catch {}
    }

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = nextState));
    } else if (nextState) {
      await getOrCreateLocalStream(isCamOn, true);
    }
    setIsMicOn(nextState);
  }, [isMicOn, isCamOn]);

  // Toggle Camera
  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    const nextState = !isCamOn;

    if (room && room.localParticipant) {
      try {
        await room.localParticipant.setCameraEnabled(nextState);
      } catch {}
    }

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = nextState));
    } else if (nextState) {
      await getOrCreateLocalStream(true, isMicOn);
    }
    setIsCamOn(nextState);
  }, [isCamOn, isMicOn]);

  // Toggle Screen Share
  const toggleScreen = useCallback(async () => {
    const room = roomRef.current;
    const nextState = !isScreenOn;

    if (room && room.localParticipant) {
      try {
        await room.localParticipant.setScreenShareEnabled(nextState);
      } catch {}
    }
    setIsScreenOn(nextState);
  }, [isScreenOn]);

  // Connect LiveKit Cloud if valid URL & token provided
  useEffect(() => {
    if (!url || !token) return;

    if (url === 'wss://your-project.livekit.cloud') {
      return;
    }

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    (async () => {
      try {
        await room.connect(url, token);
      } catch (err) {
        console.warn('[LiveKit] Connection notice:', err);
      }
    })();

    return () => {
      room.disconnect();
    };
  }, [url, token]);

  // Recompute per-peer proximity, audio falloff, and room isolation
  useEffect(() => {
    if (!localPlayer) return;

    const localZoneMeta = mapData.zones.find((z) => z.id === localPlayer.zoneId);
    const peerMap: Record<string, ProximityPeer> = {};

    Object.values(players).forEach((peer) => {
      if (peer.id === localPlayer.id) return;

      const peerZoneMeta = mapData.zones.find((z) => z.id === peer.zoneId);
      const dist = Math.round(getDistance(localPlayer.x, localPlayer.y, peer.x, peer.y));
      const inSameRoom = Boolean(localPlayer.zoneId && localPlayer.zoneId === peer.zoneId);
      const isBroadcast = Boolean((peerZoneMeta as { isBroadcast?: boolean } | undefined)?.isBroadcast);

      let canHear = false;
      let gain = 0;

      if (isBroadcast) {
        canHear = true;
        gain = 1.0;
      } else if (localZoneMeta?.isolatedAudio || peerZoneMeta?.isolatedAudio) {
        if (inSameRoom) {
          canHear = true;
          gain = 1.0;
        }
      } else if (dist <= PROXIMITY_RADIUS) {
        canHear = true;
        const clamped = Math.max(0, dist - PROXIMITY_INNER);
        const range = PROXIMITY_RADIUS - PROXIMITY_INNER;
        gain = dist <= PROXIMITY_INNER ? 1.0 : Number(Math.pow(1 - clamped / range, 2).toFixed(2));
      }

      const canSee = (dist < PROXIMITY_RADIUS && canHear) || inSameRoom || isBroadcast;

      peerMap[peer.id] = {
        id: peer.id,
        name: peer.name,
        color: peer.color,
        distance: dist,
        gain,
        inSameRoom,
        isBroadcast,
        canHear,
        canSee,
      };
    });

    setProximityPeers(peerMap);

    // Apply LiveKit remote track volume & video subscriptions
    const room = roomRef.current;
    if (room) {
      room.remoteParticipants.forEach((participant: RemoteParticipant) => {
        const pInfo = peerMap[participant.identity];
        if (!pInfo) return;

        participant.trackPublications.forEach((pub: RemoteTrackPublication) => {
          if (pub.kind === Track.Kind.Audio && pub.audioTrack) {
            (pub.audioTrack as RemoteAudioTrack).setVolume(pInfo.gain);
          }
          if (pub.kind === Track.Kind.Video) {
            pub.setSubscribed(pInfo.canSee);
          }
        });
      });
    }
  }, [players, localPlayer]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return {
    room: roomRef.current,
    isMicOn,
    isCamOn,
    isScreenOn,
    isSpeaking,
    localStream,
    proximityPeers,
    toggleMic,
    toggleCam,
    toggleScreen,
  };
}

export default useLiveKit;
