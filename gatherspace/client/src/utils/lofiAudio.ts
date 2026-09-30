// client/src/utils/lofiAudio.ts
// Pure Web Audio procedural Lo-Fi chillhop synthesizer & ambient vinyl generator.
// Zero external asset downloads, infinite non-repeating lush chill loops.

export interface LofiTrack {
  id: string;
  name: string;
  mood: string;
  bpm: number;
  scale: number[]; // chord base frequencies
}

export const LOFI_TRACKS: LofiTrack[] = [
  {
    id: 'rainy-cafe',
    name: '☕ Rainy Coffee Bar',
    mood: 'Warm Rhodes chords & gentle rain',
    bpm: 72,
    scale: [261.63, 329.63, 392.0, 493.88, 349.23, 440.0, 523.25, 659.25], // Cmaj9 / Fmaj9
  },
  {
    id: 'midnight-lounge',
    name: '🌙 Midnight Deep Work',
    mood: 'Deep sub bass & hazy 7th chords',
    bpm: 68,
    scale: [220.0, 261.63, 329.63, 392.0, 293.66, 349.23, 440.0, 523.25], // Am9 / Dm9
  },
  {
    id: 'sunset-chillhop',
    name: '🌅 Rooftop Sunset Chords',
    mood: 'Warm retro analog tape drift',
    bpm: 76,
    scale: [311.13, 392.0, 466.16, 587.33, 277.18, 349.23, 415.3, 523.25], // Ebmaj9 / Dbmaj9
  },
  {
    id: 'neon-arcade-chill',
    name: '👾 Cyber Chill Arcade',
    mood: 'Dreamy synth pads & soft beats',
    bpm: 80,
    scale: [293.66, 369.99, 440.0, 554.37, 246.94, 311.13, 369.99, 466.16], // Dmaj9 / Bm9
  },
];

class LofiAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private currentTrackIndex: number = 0;
  private masterGain: GainNode | null = null;
  private spatialGain: GainNode | null = null;
  private vinylNode: AudioBufferSourceNode | null = null;
  private timerId: number | null = null;
  private step: number = 0;
  private userVolume: number = 0.7;
  private currentSpatialMultiplier: number = 0;

  // Spatial listener position vs acoustic hubs
  private soundEmitters = [
    { x: 1245, y: 1340, radius: 480, name: 'Coffee Bar Jukebox' },
    { x: 1980, y: 1080, radius: 460, name: 'Gaming Lounge Jukebox' },
  ];

  public onTrackChange?: (track: LofiTrack) => void;
  public onPlayStateChange?: (playing: boolean) => void;

  private getContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.spatialGain = this.ctx.createGain();

        this.spatialGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(this.userVolume, this.ctx.currentTime);

        this.spatialGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Create infinite soft vinyl record crackle noise
  private startVinylNoise(ctx: AudioContext) {
    if (this.vinylNode) return;
    try {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Pinkish noise with occasional crackle pops
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        let sample = (b0 + b1 + b2 + white * 0.5362) * 0.02;

        // Add periodic vinyl dust pop
        if (Math.random() < 0.0008) {
          sample += (Math.random() * 2 - 1) * 0.18;
        }
        data[i] = sample;
      }

      this.vinylNode = ctx.createBufferSource();
      this.vinylNode.buffer = buffer;
      this.vinylNode.loop = true;

      const vinylFilter = ctx.createBiquadFilter();
      vinylFilter.type = 'bandpass';
      vinylFilter.frequency.value = 1200;
      vinylFilter.Q.value = 0.8;

      const vinylGain = ctx.createGain();
      vinylGain.gain.value = 0.12;

      this.vinylNode.connect(vinylFilter);
      vinylFilter.connect(vinylGain);
      if (this.spatialGain) {
        vinylGain.connect(this.spatialGain);
      }

      this.vinylNode.start();
    } catch {
      // Ignored if audio not initialized
    }
  }

  // Play a soft mellow Lo-Fi chord note
  private playChordNote(ctx: AudioContext, freq: number, duration: number, vel: number = 0.08) {
    if (!this.spatialGain) return;
    try {
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Warm triangle with subtle tape detune
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq + (Math.random() * 0.8 - 0.4), ctx.currentTime);

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq / 2, ctx.currentTime);

      // Soft low-pass filter for vintage lo-fi warmth
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650 + Math.random() * 250, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + duration);

      // ADSR Envelope
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vel, ctx.currentTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(vel * 0.6, ctx.currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(gain);
      gain.connect(this.spatialGain);

      osc.start(ctx.currentTime);
      subOsc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
      subOsc.stop(ctx.currentTime + duration);
    } catch {}
  }

  // Soft lo-fi kick / rimshot drum tick
  private playLoFiPercussion(ctx: AudioContext, isKick: boolean) {
    if (!this.spatialGain) return;
    try {
      if (isKick) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(95, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.18);

        gain.gain.setValueAtTime(0.09, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

        osc.connect(gain);
        gain.connect(this.spatialGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
      } else {
        // Soft brush rimshot
        const bufferSize = ctx.sampleRate * 0.05;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 3200;
        const gain = ctx.createGain();
        gain.gain.value = 0.04;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.spatialGain);
        noise.start(ctx.currentTime);
      }
    } catch {}
  }

  private tick = () => {
    const ctx = this.getContext();
    if (!ctx || !this.isPlaying) return;

    const track = LOFI_TRACKS[this.currentTrackIndex];
    const beatMs = (60 / track.bpm) * 1000;

    // Pattern sequencer (16-step bar)
    const chordIndex = Math.floor((this.step % 16) / 4);
    const isBarStart = this.step % 4 === 0;

    if (isBarStart) {
      // Play 4-note jazz chord
      const baseFreq = track.scale[chordIndex % track.scale.length];
      this.playChordNote(ctx, baseFreq, 2.2, 0.07);
      this.playChordNote(ctx, baseFreq * 1.25, 2.0, 0.05); // Major/minor 3rd
      this.playChordNote(ctx, baseFreq * 1.5, 2.1, 0.05);  // 5th
      this.playChordNote(ctx, baseFreq * 1.875, 1.8, 0.04); // 7th
    }

    // Gentle rhythm ticks
    if (this.step % 4 === 0) {
      this.playLoFiPercussion(ctx, true); // Kick on beat 1
    } else if (this.step % 4 === 2) {
      this.playLoFiPercussion(ctx, false); // Rimshot on beat 3
    }

    this.step = (this.step + 1) % 64;
    this.timerId = window.setTimeout(this.tick, beatMs / 2);
  };

  public play() {
    const ctx = this.getContext();
    if (!ctx) return;
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.startVinylNoise(ctx);
    this.tick();
    this.onPlayStateChange?.(true);
  }

  public pause() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
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

  public nextTrack() {
    this.currentTrackIndex = (this.currentTrackIndex + 1) % LOFI_TRACKS.length;
    this.step = 0;
    const track = LOFI_TRACKS[this.currentTrackIndex];
    this.onTrackChange?.(track);
  }

  public prevTrack() {
    this.currentTrackIndex = (this.currentTrackIndex - 1 + LOFI_TRACKS.length) % LOFI_TRACKS.length;
    this.step = 0;
    const track = LOFI_TRACKS[this.currentTrackIndex];
    this.onTrackChange?.(track);
  }

  public getCurrentTrack(): LofiTrack {
    return LOFI_TRACKS[this.currentTrackIndex];
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setMasterVolume(vol: number) {
    this.userVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.userVolume, this.ctx.currentTime, 0.05);
    }
  }

  public getMasterVolume(): number {
    return this.userVolume;
  }

  // Update spatial volume according to player's distance from chill/coffee zones
  public updateSpatialPosition(playerX: number, playerY: number, inZoneId: string | null) {
    const ctx = this.getContext();
    if (!ctx || !this.spatialGain) return;

    let maxProximity = 0;

    // Direct boost if inside Coffee Lounge or Gaming Corner
    if (inZoneId === 'coffee_lounge' || inZoneId === 'gaming_corner') {
      maxProximity = 1.0;
    } else {
      for (const emitter of this.soundEmitters) {
        const dx = playerX - emitter.x;
        const dy = playerY - emitter.y;
        const dist = Math.hypot(dx, dy);
        if (dist < emitter.radius) {
          const prox = Math.max(0, 1 - dist / emitter.radius);
          // Smooth bell curve
          const curved = Math.pow(prox, 1.4);
          if (curved > maxProximity) maxProximity = curved;
        }
      }
    }

    // Minimum baseline ambient if enabled, or smoothly fade to 0 in quiet zones
    const targetGain = maxProximity;
    this.currentSpatialMultiplier = targetGain;

    this.spatialGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.12);

    // Auto-start playing if entered a chill zone and was not active
    if (targetGain > 0.05 && !this.isPlaying && ctx.state === 'running') {
      this.play();
    }
  }

  public getSpatialMultiplier(): number {
    return this.currentSpatialMultiplier;
  }
}

export const lofiEngine = new LofiAudioEngine();
