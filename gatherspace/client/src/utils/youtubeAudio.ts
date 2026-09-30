// client/src/utils/youtubeAudio.ts
// Headless YouTube IFrame Spatial Audio Engine for GatherSpace.
// Plays any YouTube link / stream on infinite loop with continuous spatial volume attenuation.
// Automatic resilient fallback to Fred again.. (Arun's Roof Live) if custom stream fails.

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface StreamTrack {
  id: string;
  title: string;
  artist: string;
  youtubeId: string;
  isCustom?: boolean;
}

export const FALLBACK_TRACK: StreamTrack = {
  id: 'fred-again-aruns-roof',
  title: "Arun's Roof (Live)",
  artist: 'Fred again..',
  youtubeId: '6MAzUT1YhWE', // Fred again.. Studio / Rooftop Live Set
};

export const CURATED_PRESETS: StreamTrack[] = [
  FALLBACK_TRACK,
  {
    id: 'lofi-girl',
    title: 'beats to relax/study to (24/7)',
    artist: 'Lofi Girl',
    youtubeId: 'jfKfPfyJRdk',
  },
  {
    id: 'rainy-coffee-jazz',
    title: 'Rainy Coffee Shop Ambience & Soft Jazz',
    artist: 'Coffee Lounge',
    youtubeId: '-5KAN9_CzSA',
  },
  {
    id: 'tokyo-midnight-lofi',
    title: 'Tokyo Night Drive Chill Lofi',
    artist: 'Midnight Chill',
    youtubeId: 'TURbeWK2wwg',
  },
];

class YouTubeAudioEngine {
  private player: any = null;
  private isApiReady: boolean = false;
  private isPlaying: boolean = false;
  private currentTrack: StreamTrack = FALLBACK_TRACK;
  private masterVolume: number = 0.30; // 30% default master volume
  private spatialMultiplier: number = 0.0; // 0.0 to 1.0
  private containerId = 'gatherspace-yt-player-container';
  private hasUserInteracted: boolean = false;
  private fallbackTimeout: number | null = null;

  // Listeners
  public onTrackChange?: (track: StreamTrack) => void;
  public onPlayStateChange?: (playing: boolean) => void;
  public onSpatialChange?: (spatialMult: number, effectiveVolume: number) => void;
  public onFallbackTriggered?: (failedId: string, reason: string) => void;

  constructor() {
    this.initYouTubeAPI();
  }

  // Extract 11-character YouTube ID from various URL formats
  public extractYouTubeId(urlOrId: string): string | null {
    if (!urlOrId) return null;
    const clean = urlOrId.trim();

    // Direct 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
      return clean;
    }

    // Standard URLs: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/live/ID, youtube.com/embed/ID
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
      /[?&]v=([a-zA-Z0-9_-]{11})/,
    ];

    for (const regex of patterns) {
      const match = clean.match(regex);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  private initYouTubeAPI() {
    if (typeof window === 'undefined') return;

    // Create hidden container for the iframe if not present
    let container = document.getElementById(this.containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = this.containerId;
      container.style.position = 'fixed';
      container.style.width = '1px';
      container.style.height = '1px';
      container.style.top = '-100px';
      container.style.left = '-100px';
      container.style.opacity = '0.01';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '-1';
      document.body.appendChild(container);
    }

    const onApiReady = () => {
      this.isApiReady = true;
      this.createPlayer(this.currentTrack.youtubeId);
    };

    if (window.YT && window.YT.Player) {
      onApiReady();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        onApiReady();
      };

      // Inject YouTube script tag if not already injected
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }
    }
  }

  private createPlayer(videoId: string) {
    if (!window.YT || !window.YT.Player) return;

    const playerDiv = document.createElement('div');
    playerDiv.id = 'yt-embedded-audio-frame';
    const container = document.getElementById(this.containerId);
    if (container) {
      container.innerHTML = '';
      container.appendChild(playerDiv);
    }

    try {
      this.player = new window.YT.Player('yt-embedded-audio-frame', {
        height: '100',
        width: '100',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          loop: 1,
          playlist: videoId,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            this.updatePlayerVolume();
            if (this.isPlaying) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
            if (event.data === 1) {
              this.isPlaying = true;
              this.clearFallbackTimer();
              this.onPlayStateChange?.(true);
            } else if (event.data === 2) {
              this.isPlaying = false;
              this.onPlayStateChange?.(false);
            } else if (event.data === 0) {
              // Auto-loop on finish
              if (this.player && typeof this.player.seekTo === 'function') {
                this.player.seekTo(0);
                this.player.playVideo();
              }
            }
          },
          onError: (event: any) => {
            console.warn('[GatherSpace Audio] YouTube Player Error Code:', event.data);
            this.handlePlaybackFailure(`Error code ${event.data} (Embed restricted or invalid ID)`);
          },
        },
      });
    } catch (err) {
      console.error('[GatherSpace Audio] Failed to instantiate YouTube player:', err);
    }
  }

  private handlePlaybackFailure(reason: string) {
    const failedId = this.currentTrack.youtubeId;
    this.onFallbackTriggered?.(failedId, reason);

    // If current is not the default fallback, switch to Fred again..
    if (this.currentTrack.youtubeId !== FALLBACK_TRACK.youtubeId) {
      console.log("[GatherSpace Audio] Switching to default fallback: Fred again.. Arun's Roof");
      this.loadTrack(FALLBACK_TRACK);
    }
  }

  private clearFallbackTimer() {
    if (this.fallbackTimeout !== null) {
      clearTimeout(this.fallbackTimeout);
      this.fallbackTimeout = null;
    }
  }

  private updatePlayerVolume() {
    if (!this.player || typeof this.player.setVolume !== 'function') return;

    // Effective volume = master * spatial
    const effective = this.masterVolume * this.spatialMultiplier;
    const targetVolumePercent = Math.max(0, Math.min(100, Math.round(effective * 100)));

    try {
      this.player.setVolume(targetVolumePercent);
      if (targetVolumePercent > 0 && typeof this.player.unMute === 'function') {
        this.player.unMute();
      }
      this.onSpatialChange?.(this.spatialMultiplier, effective);
    } catch { }
  }

  // Public API: Load any YouTube video by URL or ID
  public loadUrlOrId(urlOrId: string, customTitle?: string) {
    const videoId = this.extractYouTubeId(urlOrId);
    if (!videoId) {
      this.handlePlaybackFailure('Invalid YouTube URL format');
      return false;
    }

    const track: StreamTrack = {
      id: `custom-${videoId}`,
      title: customTitle || `YouTube Stream (${videoId})`,
      artist: 'Custom Lounge Stream',
      youtubeId: videoId,
      isCustom: true,
    };

    this.loadTrack(track);
    return true;
  }

  public loadTrack(track: StreamTrack) {
    this.currentTrack = track;
    this.onTrackChange?.(track);

    this.clearFallbackTimer();
    // Set 6s watchdog: if video doesn't play, trigger fallback
    this.fallbackTimeout = window.setTimeout(() => {
      if (!this.isPlaying && this.currentTrack.youtubeId !== FALLBACK_TRACK.youtubeId) {
        this.handlePlaybackFailure('Video failed to start within timeout');
      }
    }, 6000);

    if (this.player && typeof this.player.loadVideoById === 'function') {
      try {
        this.player.loadVideoById({
          videoId: track.youtubeId,
          startSeconds: 0,
        });
        this.isPlaying = true;
        this.updatePlayerVolume();
      } catch (err) {
        console.warn('[GatherSpace Audio] loadVideoById error, recreating player...', err);
        this.createPlayer(track.youtubeId);
      }
    } else if (this.isApiReady) {
      this.createPlayer(track.youtubeId);
    }
  }

  public play() {
    this.isPlaying = true;
    this.hasUserInteracted = true;
    if (this.player && typeof this.player.playVideo === 'function') {
      try {
        this.player.playVideo();
        this.updatePlayerVolume();
      } catch { }
    } else if (!this.player && this.isApiReady) {
      this.createPlayer(this.currentTrack.youtubeId);
    }
    this.onPlayStateChange?.(true);
  }

  public pause() {
    this.isPlaying = false;
    if (this.player && typeof this.player.pauseVideo === 'function') {
      try {
        this.player.pauseVideo();
      } catch { }
    }
    this.onPlayStateChange?.(false);
  }

  public toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this.updatePlayerVolume();
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public getCurrentTrack(): StreamTrack {
    return this.currentTrack;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getSpatialMultiplier(): number {
    return this.spatialMultiplier;
  }

  // Update spatial volume attenuation based on player's position in the office
  public updateSpatialPosition(playerX: number, playerY: number, inZoneId: string | null) {
    // Strictly silenced inside soundproof meeting suites
    if (inZoneId === 'room_a' || inZoneId === 'room_b') {
      if (this.spatialMultiplier !== 0) {
        this.spatialMultiplier = 0;
        this.updatePlayerVolume();
      }
      return;
    }

    let targetMultiplier = 0;

    // Full presence inside Tea & Coffee Lounge, quiet subtle presence in Reception
    if (inZoneId === 'coffee_lounge' || inZoneId === 'gaming_corner') {
      targetMultiplier = 1.0;
    } else if (inZoneId === 'reception') {
      targetMultiplier = 0.16; // Low subtle background ambient in welcome lobby & reception
    } else {
      // Acoustic hubs across the office
      const emitters = [
        { x: 425, y: 310, radius: 420, maxMult: 0.16 },  // Welcome Lobby (low subtle volume)
        { x: 1250, y: 1330, radius: 620, maxMult: 1.0 }, // Tea & Coffee Lounge Jukebox
        { x: 2015, y: 1085, radius: 520, maxMult: 0.85 }, // Chill Gaming Corner
      ];

      for (const em of emitters) {
        const dist = Math.hypot(playerX - em.x, playerY - em.y);
        if (dist < em.radius) {
          const linear = Math.max(0, 1 - dist / em.radius);
          const val = Math.pow(linear, 1.25) * em.maxMult;
          if (val > targetMultiplier) targetMultiplier = val;
        }
      }

      // Soft ambient background floor volume in open coworking area
      if (targetMultiplier < 0.14 && (inZoneId === 'coworking' || !inZoneId)) {
        targetMultiplier = 0.14;
      }
    }

    // Apply change if different
    if (Math.abs(this.spatialMultiplier - targetMultiplier) > 0.02) {
      this.spatialMultiplier = targetMultiplier;
      this.updatePlayerVolume();

      // If user walked into active audio zone and hasn't started playing, auto-play if permitted
      if (targetMultiplier > 0.1 && !this.isPlaying && this.hasUserInteracted) {
        this.play();
      }
    }
  }
}

export const youtubeAudio = new YouTubeAudioEngine();
