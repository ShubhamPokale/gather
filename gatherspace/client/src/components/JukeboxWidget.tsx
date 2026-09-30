// client/src/components/JukeboxWidget.tsx
// Minimal Metropolitan Lounge Jukebox Widget with YouTube Stream Player,
// Custom URL Input, and Fred again.. (Arun's Roof) Fallback Protection.

import React, { useState, useEffect } from 'react';
import { youtubeAudio, CURATED_PRESETS, FALLBACK_TRACK, StreamTrack } from '../utils/youtubeAudio';
import { soundFX } from '../utils/audio';

interface JukeboxWidgetProps {
  currentZone: string | null;
  onBroadcastMusic?: (track: StreamTrack) => void;
}

export const JukeboxWidget: React.FC<JukeboxWidgetProps> = ({ currentZone, onBroadcastMusic }) => {
  const [isPlaying, setIsPlaying] = useState(youtubeAudio.getIsPlaying());
  const [currentTrack, setCurrentTrack] = useState<StreamTrack>(youtubeAudio.getCurrentTrack());
  const [volume, setVolume] = useState(youtubeAudio.getMasterVolume());
  const [spatialLevel, setSpatialLevel] = useState(youtubeAudio.getSpatialMultiplier());
  const [isExpanded, setIsExpanded] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [fallbackToast, setFallbackToast] = useState<string | null>(null);

  useEffect(() => {
    youtubeAudio.onPlayStateChange = (playing) => setIsPlaying(playing);
    youtubeAudio.onTrackChange = (track) => setCurrentTrack(track);
    youtubeAudio.onSpatialChange = (spatial) => setSpatialLevel(spatial);

    youtubeAudio.onFallbackTriggered = (_failedId, reason) => {
      setFallbackToast(`Stream unavailable (${reason}). Playing default: Fred again.. Arun's Roof`);
      soundFX.chatPing();
      setTimeout(() => setFallbackToast(null), 5000);
    };

    const interval = setInterval(() => {
      setSpatialLevel(youtubeAudio.getSpatialMultiplier());
      setIsPlaying(youtubeAudio.getIsPlaying());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const handleTogglePlay = () => {
    soundFX.emotePop();
    youtubeAudio.toggle();
    setIsPlaying(youtubeAudio.getIsPlaying());
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    youtubeAudio.setMasterVolume(val);
  };

  const handleSelectPreset = (preset: StreamTrack) => {
    soundFX.emotePop();
    youtubeAudio.loadTrack(preset);
    setCurrentTrack(preset);
    if (onBroadcastMusic) onBroadcastMusic(preset);
  };

  const handleLoadCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;

    const success = youtubeAudio.loadUrlOrId(customInput.trim());
    if (success) {
      soundFX.proximityConnect();
      setCustomInput('');
      const updated = youtubeAudio.getCurrentTrack();
      setCurrentTrack(updated);
      if (onBroadcastMusic) onBroadcastMusic(updated);
    } else {
      setFallbackToast('Invalid YouTube URL format. Paste a valid youtube.com or youtu.be link.');
      setTimeout(() => setFallbackToast(null), 4000);
    }
  };

  const isInLounge = currentZone === 'coffee_lounge' || currentZone === 'gaming_corner';

  return (
    <div
      style={{
        position: 'fixed',
        top: 72,
        right: 20,
        zIndex: 90,
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      }}
    >
      {/* Fallback Error / Info Toast */}
      {fallbackToast && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            width: 300,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            color: '#fef3c7',
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 11,
            lineHeight: 1.4,
            boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <i className="fas fa-triangle-exclamation text-amber-400" style={{ marginTop: 2 }}></i>
          <span>{fallbackToast}</span>
        </div>
      )}

      {/* Main Pill Bar */}
      <div
        style={{
          background: 'rgba(10, 13, 20, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: isInLounge ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: isInLounge ? '0 8px 32px rgba(245, 158, 11, 0.15)' : '0 8px 24px rgba(0, 0, 0, 0.4)',
          borderRadius: 12,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: '#f8fafc',
          minWidth: 220,
          maxWidth: isExpanded ? 360 : 250,
          transition: 'all 0.25s ease',
        }}
      >
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={handleTogglePlay}
          title={isPlaying ? 'Pause Lounge Audio' : 'Play Lounge Audio'}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: isPlaying ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: isPlaying ? '0 0 12px rgba(245, 158, 11, 0.4)' : 'none',
          }}
        >
          {isPlaying ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
              <span className="yt-eq-bar bar-1"></span>
              <span className="yt-eq-bar bar-2"></span>
              <span className="yt-eq-bar bar-3"></span>
            </div>
          ) : (
            <i className="fas fa-play" style={{ fontSize: 11, marginLeft: 2 }}></i>
          )}
        </button>

        {/* Track Info */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ flex: 1, minWidth: 0, cursor: 'pointer', userSelect: 'none' }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
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
              color: isInLounge ? '#fbbf24' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <i className="fas fa-music" style={{ fontSize: 8 }}></i>
            <span>{isInLounge ? `Lounge (${(spatialLevel * 100).toFixed(0)}%)` : isPlaying ? 'Spatial Proximity' : 'Paused'}</span>
          </div>
        </div>

        {/* Expand Drawer Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: 11,
            cursor: 'pointer',
            padding: 4,
          }}
          title={isExpanded ? 'Collapse Jukebox' : 'Open Jukebox Settings'}
        >
          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
        </button>
      </div>

      {/* Expanded Controls Drawer */}
      {isExpanded && (
        <div
          style={{
            marginTop: 8,
            background: 'rgba(10, 13, 20, 0.94)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 14,
            padding: '16px 18px',
            color: '#f8fafc',
            boxShadow: '0 16px 36px rgba(0,0,0,0.5)',
            width: 340,
          }}
        >
          {/* Custom YouTube URL Form */}
          <form onSubmit={handleLoadCustomUrl} style={{ marginBottom: 14 }}>
            <label
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: '#94a3b8',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Drop Any YouTube Video / Live Stream
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="https://youtube.com/watch?v=..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                style={{
                  flex: 1,
                  background: '#070a0f',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 6,
                  padding: '7px 10px',
                  color: '#ffffff',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
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
          <div style={{ marginBottom: 14 }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: '#64748b',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 8,
              }}
            >
              Curated Lounge Presets
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
                    {isSelected && <span style={{ fontSize: 9, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>ACTIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Master Volume Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 10 }}>
            <i className={`fas fa-volume-${volume === 0 ? 'xmark' : volume < 0.5 ? 'low' : 'high'}`} style={{ fontSize: 12, color: '#94a3b8' }}></i>
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
            <span style={{ fontSize: 10, color: '#94a3b8', width: 30, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
              {(volume * 100).toFixed(0)}%
            </span>
          </div>
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
