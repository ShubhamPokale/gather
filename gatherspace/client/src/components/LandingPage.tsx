// client/src/components/LandingPage.tsx
// Minimal, light, editorial. One continuous scroll: intrigue → understanding → trust → desire → action.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { soundFX } from '../utils/audio';
import { lofiEngine } from '../utils/lofiAudio';

interface LandingPageProps {
  initialRoomId: string;
  onLaunch: (name: string, color: string, roomId: string) => void;
}

const INK = '#1c1917';
const MUTED = '#78716c';
const PAPER = '#f7f4ef';
const LINE = 'rgba(28, 25, 23, 0.12)';
const ACCENT = '#c2410c';

const COLORS = ['#1c1917', '#44403c', '#c2410c', '#166534', '#3730a3', '#9d174d'];

const SPACES = [
  { name: 'The Studio Floor', desc: 'Open desks. Voices fade with distance, so nearby chats stay nearby.', dot: '#c2410c' },
  { name: 'The Tea Lounge', desc: 'A quiet corner with soft lo-fi drifting through. Good for a break.', dot: '#ca8a04', audio: true },
  { name: 'Private Suites', desc: 'Close the door. Nothing gets in, nothing gets out.', dot: '#3730a3' },
  { name: 'The Townhall', desc: 'A stage for all-hands. Everyone on the floor hears you.', dot: '#166534' },
];

/* Fades content in once as it scrolls into view */
const Reveal: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.9s ease ${delay}ms, transform 0.9s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ initialRoomId, onLaunch }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[2]);
  const [roomId, setRoomId] = useState(initialRoomId || 'studio-one');
  const [isCopied, setIsCopied] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  // Optional AV check
  const [camActive, setCamActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanRoom = useMemo(
    () => roomId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'studio-one',
    [roomId]
  );

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${cleanRoom}`;
    navigator.clipboard.writeText(url);
    soundFX.emotePop();
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => { });
    audioCtxRef.current = null;
    setMicLevel(0);
  };

  const toggleCam = async () => {
    if (camActive) {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      setCamActive(false);
      return;
    }
    try {
      camStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true });
      setCamActive(true);
      soundFX.proximityConnect();
    } catch {
      alert('Camera access was not granted.');
    }
  };

  // Attach stream after the <video> element has mounted
  useEffect(() => {
    if (camActive && videoRef.current && camStreamRef.current) {
      videoRef.current.srcObject = camStreamRef.current;
    }
  }, [camActive]);

  const toggleMic = async () => {
    if (micActive) {
      stopMic();
      setMicActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicActive(true);
      soundFX.proximityConnect();

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      alert('Microphone access was not granted.');
    }
  };

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.teleportWarp();
    setIsEntering(true);
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    stopMic();
    setTimeout(() => onLaunch(name.trim() || 'Guest', color, cleanRoom), 600);
  };

  useEffect(
    () => () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      stopMic();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const serif = "'Fraunces', Georgia, 'Times New Roman', serif";
  const mono = "'JetBrains Mono', ui-monospace, monospace";

  return (
    <div
      className={`gs-landing ${isEntering ? 'gs-out' : ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: PAPER,
        color: INK,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        scrollBehavior: 'smooth',
        zIndex: 100,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .gs-landing ::selection { background: ${ACCENT}; color: #fff; }
        .gs-out { opacity: 0; transition: opacity 0.5s ease-out; }
        .gs-btn { transition: transform .25s ease, background .25s ease, color .25s ease; }
        .gs-btn:hover { transform: translateY(-1px); }
        .gs-link { transition: color .2s ease; }
        .gs-link:hover { color: ${INK}; }
        .gs-row { transition: padding-left .35s ease; }
        .gs-row:hover { padding-left: 12px; }
        .gs-input { transition: border-color .2s ease; }
        .gs-input:focus { outline: none; border-color: ${INK}; }
        @keyframes gs-drift { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
      `}</style>

      {/* Wordmark */}
      <header style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: serif, fontSize: 20, letterSpacing: '-0.01em' }}>GatherSpace</span>
        <button
          className="gs-link"
          onClick={() => scrollTo('enter')}
          style={{ background: 'none', border: 'none', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          Enter →
        </button>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '0 32px' }}>
        {/* 1. INTRIGUE */}
        <section style={{ minHeight: '78vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: 0,
              top: '22%',
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: ACCENT,
              opacity: 0.9,
              animation: 'gs-drift 9s ease-in-out infinite',
            }}
          />
          <Reveal>
            <h1
              style={{
                fontFamily: serif,
                fontWeight: 300,
                fontSize: 'clamp(3rem, 8vw, 6.4rem)',
                lineHeight: 1.02,
                letterSpacing: '-0.035em',
                margin: 0,
                maxWidth: 820,
              }}
            >
              Remember the <em style={{ color: ACCENT, fontWeight: 400 }}>hallway?</em>
            </h1>
          </Reveal>
          <Reveal delay={150}>
            <p style={{ fontSize: 20, lineHeight: 1.6, color: MUTED, maxWidth: 520, margin: '36px 0 48px' }}>
              The small conversations that made work feel human. GatherSpace brings them back.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <button
              className="gs-btn"
              onClick={() => scrollTo('enter')}
              style={{ background: INK, color: PAPER, border: 'none', borderRadius: 999, padding: '16px 32px', fontSize: 14, fontWeight: 500, cursor: 'pointer', width: 'fit-content' }}
            >
              Step inside
            </button>
          </Reveal>
        </section>

        {/* 2. UNDERSTANDING */}
        <section style={{ padding: '140px 0', borderTop: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 680 }}>
            <Reveal>
              <p style={{ fontFamily: serif, fontSize: 'clamp(1.6rem, 3.2vw, 2.3rem)', fontWeight: 300, lineHeight: 1.35, letterSpacing: '-0.02em', margin: 0 }}>
                In an office, you turned your chair and asked a question. You overheard something useful.
                You caught someone by the kettle.
              </p>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: serif, fontSize: 'clamp(1.6rem, 3.2vw, 2.3rem)', fontWeight: 300, lineHeight: 1.35, letterSpacing: '-0.02em', color: MUTED, margin: '32px 0 0' }}>
                Now every conversation needs a link, a calendar slot, and a reason.
                We think that is backwards.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <p style={{ fontSize: 16, lineHeight: 1.75, color: MUTED, margin: '40px 0 0', maxWidth: 520 }}>
                GatherSpace is a simple floor plan. Walk toward someone and their voice gets clearer.
                Walk away and it fades. No meetings to schedule, just a place to be together.
              </p>
            </Reveal>
          </div>
        </section>

        {/* 3. TRUST + DESIRE */}
        <section style={{ padding: '0 0 140px' }}>
          <Reveal>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 40 }}>
              Four rooms
            </div>
          </Reveal>
          {SPACES.map((s, i) => (
            <Reveal key={s.name} delay={i * 80}>
              <div
                className="gs-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(180px, 1fr) 2fr',
                  gap: 24,
                  padding: '28px 0',
                  borderTop: `1px solid ${LINE}`,
                  alignItems: 'baseline',
                  ...(i === SPACES.length - 1 ? { borderBottom: `1px solid ${LINE}` } : {}),
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                  <span style={{ fontFamily: serif, fontSize: 22, letterSpacing: '-0.01em' }}>{s.name}</span>
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.6, color: MUTED }}>
                  {s.desc}
                  {s.audio && (
                    <button
                      className="gs-link"
                      type="button"
                      onClick={() => {
                        lofiEngine.toggle();
                        soundFX.emotePop();
                      }}
                      style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 15, cursor: 'pointer', padding: 0, marginLeft: 8 }}
                    >
                      Listen ♪
                    </button>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal delay={100}>
            <p style={{ fontSize: 14, color: MUTED, margin: '32px 0 0' }}>
              Nothing is recorded. Nothing is tracked. You are just in the room.
            </p>
          </Reveal>
        </section>

        {/* 4. ACTION */}
        <section id="enter" style={{ padding: '120px 0 100px', borderTop: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 440, margin: '0 auto' }}>
            <Reveal>
              <h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(2.2rem, 5vw, 3.2rem)', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 12px', textAlign: 'center' }}>
                Come in.
              </h2>
              <p style={{ textAlign: 'center', color: MUTED, fontSize: 15, margin: '0 0 48px' }}>
                The door is open. Your team is probably already there.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <form onSubmit={handleLaunch}>
                <Label>Your name</Label>
                <input
                  className="gs-input"
                  type="text"
                  placeholder="Maya Chen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                />

                <Label>Your colour</Label>
                <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => {
                        setColor(c);
                        soundFX.emotePop();
                      }}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: c,
                        border: 'none',
                        cursor: 'pointer',
                        outline: color === c ? `2px solid ${INK}` : '2px solid transparent',
                        outlineOffset: 3,
                        transition: 'outline-color .2s ease, transform .2s ease',
                        transform: color === c ? 'scale(1.1)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Label>Room</Label>
                  <button
                    className="gs-link"
                    type="button"
                    onClick={handleCopyLink}
                    style={{ background: 'none', border: 'none', color: isCopied ? '#166534' : MUTED, fontSize: 12, cursor: 'pointer', padding: 0 }}
                  >
                    {isCopied ? 'Link copied' : 'Copy invite link'}
                  </button>
                </div>
                <input
                  className="gs-input"
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  style={{ ...inputStyle, fontFamily: mono, fontSize: 13 }}
                />

                {/* Optional AV check, kept small */}
                <div style={{ display: 'flex', gap: 10, margin: '4px 0 32px', alignItems: 'center' }}>
                  <button type="button" className="gs-btn" onClick={toggleCam} style={chip(camActive)}>
                    {camActive ? '● Camera on' : 'Test camera'}
                  </button>
                  <button type="button" className="gs-btn" onClick={toggleMic} style={chip(micActive)}>
                    {micActive ? `● Mic ${micLevel}%` : 'Test mic'}
                  </button>
                </div>
                {camActive && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 12, transform: 'scaleX(-1)', marginBottom: 32 }}
                  />
                )}

                <button
                  className="gs-btn"
                  type="submit"
                  style={{ width: '100%', background: INK, color: PAPER, border: 'none', borderRadius: 999, padding: '17px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                >
                  Step inside #{cleanRoom}
                </button>
              </form>
            </Reveal>
          </div>
        </section>

        {/* Footer: quiet credit */}
        <footer
          style={{
            borderTop: `1px solid ${LINE}`,
            padding: '28px 0 48px',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: 12,
            color: MUTED,
          }}
        >
          <span>
            Designed &amp; built by <span style={{ color: INK }}>Shubham Pokale</span>
          </span>
          <span style={{ fontFamily: mono }}>© 2026</span>
        </footer>
      </main>
    </div>
  );
};

/* ── small helpers ─────────────────────────────────────────── */

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label
    style={{
      display: 'block',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 10,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: MUTED,
      marginBottom: 10,
    }}
  >
    {children}
  </label>
);

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 0',
  marginBottom: 32,
  background: 'transparent',
  border: 'none',
  borderBottom: `1px solid ${LINE}`,
  borderRadius: 0,
  color: INK,
  fontSize: 16,
};

const chip = (active: boolean): React.CSSProperties => ({
  background: 'transparent',
  border: `1px solid ${active ? '#166534' : LINE}`,
  color: active ? '#166534' : MUTED,
  borderRadius: 999,
  padding: '7px 14px',
  fontSize: 12,
  cursor: 'pointer',
});