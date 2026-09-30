// client/src/components/JukeboxWidget.tsx
// Minimal Metropolitan Floating Audio Hub & Spatial Jukebox Controller.
// Stream any YouTube URL or select curated presets with spatial proximity attenuation.

import React, { useState, useEffect } from 'react';
import { youtubeAudio, CURATED_PRESETS, FALLBACK_TRACK, StreamTrack } from '../utils/youtubeAudio';

interface JukeboxWidgetProps {
  currentZone: string | null;
}

export const JukeboxWidget: React.FC<JukeboxWidgetProps> = ({ currentZone }) => {
  const [isPlaying, setIsPlaying] = useState(youtubeAudio.getIsPlaying());
  const [currentTrack, setCurrentTrack] = useState<StreamTrack>(youtubeAudio.getCurrentTrack());
  const [volume, setVolume] = useState(youtubeAudio.getMasterVolume()); // Defaults to 0.30 (30%)
  const [spatialLevel, setSpatialLevel] = useState(youtubeAudio.getSpatialMultiplier());
  const [isExpanded, setIsExpanded] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [errorToast, setErrorToast] = useState<string | null>(null);

  useEffect(() => {
    youtubeAudio.onPlayStateChange = (playing) => setIsPlaying(playing);
    youtubeAudio.onTrackChange = (track) => setCurrentTrack(track);
    youtubeAudio.onSpatialChange = (spatialMult) => setSpatialLevel(spatialMult);
    youtubeAudio.onFallbackTriggered = (_failedId, reason) => {
      setErrorToast(`Audio stream unavailable (${reason}). Fallback: Fred again..`);
      setTimeout(() => setErrorToast(null), 4000);
    };

    const interval = setInterval(() => {
      setSpatialLevel(youtubeAudio.getSpatialMultiplier());
      setIsPlaying(youtubeAudio.getIsPlaying());
    }, 400);

    return () => clearInterval(interval);
  }, []);

  const handleTogglePlay = () => {
    youtubeAudio.toggle();
    setIsPlaying(youtubeAudio.getIsPlaying());
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    youtubeAudio.setMasterVolume(val);
  };

  const handleSelectPreset = (preset: StreamTrack) => {
    youtubeAudio.loadTrack(preset);
    youtubeAudio.play();
  };

  const handleLoadCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;

    const success = youtubeAudio.loadUrlOrId(customInput.trim());
    if (success) {
      youtubeAudio.play();
      setCustomInput('');
    } else {
      setErrorToast('Please enter a valid YouTube video or stream link.');
      setTimeout(() => setErrorToast(null), 3500);
    }
  };

  const isInLounge = currentZone === 'coffee_lounge' || currentZone === 'gaming_corner';
  const isInLobby = currentZone === 'reception';
  const isSoundproof = currentZone === 'room_a' || currentZone === 'room_b';

  return (
    <div
      className={`jukebox-widget-container ${isExpanded ? 'expanded' : ''}`}
      style={{
        position: 'fixed',
        top: 72,
        left: 16,
        zIndex: 50,
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Collapsed Compact Pill */}
      <div
        style={{
          background: 'rgba(10, 14, 23, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: isInLounge
            ? '1px solid rgba(245, 158, 11, 0.45)'
            : isInLobby
            ? '1px solid rgba(56, 189, 248, 0.35)'
            : '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: isInLounge
            ? '0 8px 30px rgba(245, 158, 11, 0.16)'
            : '0 8px 24px rgba(0, 0, 0, 0.45)',
          borderRadius: 12,
          padding: '7px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          color: '#f1f5f9',
          width: isExpanded ? 340 : 250,
        }}
      >
        {/* Play/Pause Button with Animated Equalizer */}
        <button
          type="button"
          onClick={handleTogglePlay}
          title={isPlaying ? 'Pause Background Stream' : 'Play Background Stream'}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: isPlaying
              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
              : 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'transform 0.15s ease',
            boxShadow: isPlaying ? '0 0 12px rgba(245, 158, 11, 0.45)' : 'none',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.94)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {isPlaying ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
              <span className="yt-eq-bar bar-1"></span>
              <span className="yt-eq-bar bar-2"></span>
              <span className="yt-eq-bar bar-3"></span>
            </div>
          ) : (
            <i className="fas fa-play" style={{ fontSize: 11, marginLeft: 2 }}></i>
          )}
        </button>

        {/* Track Title & Spatial Indicator */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            flex: 1,
            minWidth: 0,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: '#f8fafc',
            }}
          >
            {currentTrack.title}
          </div>

          <div
            style={{
              fontSize: 10,
              color: isSoundproof
                ? '#94a3b8'
                : isInLounge
                ? '#fbbf24'
                : isInLobby
                ? '#38bdf8'
                : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 1,
            }}
          >
            {isSoundproof ? (
              <span>🔇 Soundproof Suite (Muted)</span>
            ) : isInLounge ? (
              <>
                <i className="fas fa-coffee" style={{ fontSize: 9 }}></i>
                <span>Lounge Audio ({(spatialLevel * 100).toFixed(0)}%)</span>
              </>
            ) : isInLobby ? (
              <>
                <i className="fas fa-door-open" style={{ fontSize: 9 }}></i>
                <span>Lobby Ambience ({(spatialLevel * 100).toFixed(0)}%)</span>
              </>
            ) : (
              <span>{isPlaying ? `Spatial Audio (${(spatialLevel * 100).toFixed(0)}%)` : 'Paused'}</span>
            )}
          </div>
        </div>

        {/* Expand / Collapse Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 11,
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={isExpanded ? 'Collapse' : 'Audio Settings & YouTube Stream Link'}
        >
          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
        </button>
      </div>

      {/* Expanded Controls Drawer */}
      {isExpanded && (
        <div
          style={{
            marginTop: 6,
            background: 'rgba(10, 14, 23, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 14,
            padding: '14px 16px',
            color: '#f1f5f9',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.55)',
            width: 340,
          }}
        >
          {/* Custom YouTube URL Form */}
          <form onSubmit={handleLoadCustomUrl} style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#94a3b8',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Drop Any YouTube Video / Stream Link
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="https://youtube.com/watch?v=..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 6,
                  padding: '7px 10px',
                  color: '#ffffff',
                  fontSize: 11,
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  background: '#f59e0b',
                  color: '#000000',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Play Link
              </button>
            </div>
          </form>

          {/* Curated Presets List */}
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Curated Streams
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {CURATED_PRESETS.map((preset) => {
                const isSelected = currentTrack.youtubeId === preset.youtubeId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    style={{
                      background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      color: isSelected ? '#fbbf24' : '#cbd5e1',
                      fontSize: 11,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {preset.id === FALLBACK_TRACK.id ? '🎹 ' : '☕ '}
                      {preset.title}
                    </span>
                    {isSelected && <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>ACTIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Master Volume Slider (Defaults to 30%) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 10 }}>
            <i
              className={`fas fa-volume-${volume === 0 ? 'xmark' : volume < 0.5 ? 'low' : 'high'}`}
              style={{ fontSize: 12, color: '#94a3b8', width: 14 }}
            ></i>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              style={{
                flex: 1,
                accentColor: '#f59e0b',
                cursor: 'pointer',
                height: 4,
              }}
            />
            <span style={{ fontSize: 10, color: '#94a3b8', width: 32, textAlign: 'right', fontWeight: 600 }}>
              {(volume * 100).toFixed(0)}%
            </span>
          </div>

          {errorToast && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', borderRadius: 4 }}>
              {errorToast}
            </div>
          )}
        </div>
      )}

      {/* Equalizer CSS */}
      <style>{`
        .yt-eq-bar {
          width: 2.5px;
          background: #ffffff;
          border-radius: 1px;
          animation: ytEqBounce 1.2s infinite ease-in-out;
        }
        .bar-1 { height: 60%; animation-delay: 0s; }
        .bar-2 { height: 100%; animation-delay: 0.2s; }
        .bar-3 { height: 40%; animation-delay: 0.4s; }

        @keyframes ytEqBounce {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
        }
      `}</style>
    </div>
  );
};
