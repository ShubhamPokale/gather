// client/src/components/WhiteboardModal.tsx
// High-fidelity Collaborative Whiteboard & Architecture Canvas.

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface WhiteboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
}

type Tool = 'pen' | 'highlighter' | 'rect' | 'circle' | 'line' | 'arrow' | 'eraser' | 'note';

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

const PRESET_COLORS = [
  '#38bdf8', // Sky Cyan
  '#ec4899', // Hot Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ef4444', // Coral Red
  '#f8fafc', // Clean White
  '#64748b', // Slate Gray
];

const STICKY_COLORS = ['#fef08a', '#bbf7d0', '#fecdd3', '#bae6fd', '#e9d5ff'];

export const WhiteboardModal: React.FC<WhiteboardModalProps> = ({ isOpen, onClose, userName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [lineWidth, setLineWidth] = useState<number>(3);
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([
    { id: '1', x: 80, y: 100, text: '🎯 Q3 Architecture Goals:\n- Realtime Spatial Audio\n- Sub-50ms Latency', color: '#fef08a' }
  ]);
  const [activeNoteText, setActiveNoteText] = useState('');
  const [history, setHistory] = useState<ImageData[]>([]);
  const isDrawing = useRef(false);
  const startPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const snapshot = useRef<ImageData | null>(null);

  // Initialize Canvas buffer
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Buffer dimensions
    canvas.width = 1200;
    canvas.height = 700;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle blueprint grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Save initial state to history
    const initialImg = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([initialImg]);
  }, [isOpen]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoords(e);
    isDrawing.current = true;
    startPos.current = coords;

    if (tool === 'note') {
      const newNote: StickyNote = {
        id: Date.now().toString(),
        x: coords.x,
        y: coords.y,
        text: activeNoteText || 'New Note...',
        color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)],
      };
      setStickyNotes((prev) => [...prev, newNote]);
      isDrawing.current = false;
      return;
    }

    // Save snapshot for shapes preview
    snapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoords(e);

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tool === 'pen') {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = 1.0;
      } else if (tool === 'highlighter') {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth * 4;
        ctx.globalAlpha = 0.3;
      } else if (tool === 'eraser') {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = lineWidth * 5;
        ctx.globalAlpha = 1.0;
      }

      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    } else if (snapshot.current) {
      // Shape preview - restore snapshot
      ctx.putImageData(snapshot.current, 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const sx = startPos.current.x;
      const sy = startPos.current.y;

      if (tool === 'rect') {
        ctx.strokeRect(sx, sy, coords.x - sx, coords.y - sy);
      } else if (tool === 'circle') {
        const radius = Math.hypot(coords.x - sx, coords.y - sy);
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      } else if (tool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();

        const angle = Math.atan2(coords.y - sy, coords.x - sx);
        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
        ctx.lineTo(coords.x - headLen * Math.cos(angle - Math.PI / 6), coords.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(coords.x, coords.y);
        ctx.lineTo(coords.x - headLen * Math.cos(angle + Math.PI / 6), coords.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-15), img]);
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = history.slice(0, -1);
    const prevImg = newHistory[newHistory.length - 1];
    ctx.putImageData(prevImg, 0, 0);
    setHistory(newHistory);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev, img]);
    setStickyNotes([]);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `GatherSpace-Whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(5, 8, 16, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '94vw',
          maxWidth: 1100,
          height: '86vh',
          background: '#0b1120',
          borderRadius: 24,
          border: '1px solid rgba(56, 189, 248, 0.25)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.95)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #0284c7, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 16,
              }}
            >
              <i className="fas fa-chalkboard"></i>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                Collaborative Architecture Whiteboard
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 9999, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 600 }}>
                  Interactive Station
                </span>
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Real-time sketching, sticky notes, and system diagramming for {userName}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleUndo}
              title="Undo last action"
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="fas fa-undo"></i> Undo
            </button>
            <button
              onClick={handleClear}
              title="Clear entire whiteboard"
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="fas fa-trash-alt"></i> Clear
            </button>
            <button
              onClick={handleDownload}
              title="Save snapshot image"
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                border: 'none',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="fas fa-download"></i> Export PNG
            </button>
            <button
              onClick={onClose}
              title="Close Whiteboard"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Floating Toolbar Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px',
            background: '#090d16',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* Tool selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255, 255, 255, 0.04)', padding: 3, borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            {[
              { id: 'pen', icon: 'fa-pen', label: 'Pen' },
              { id: 'highlighter', icon: 'fa-highlighter', label: 'Glow' },
              { id: 'rect', icon: 'fa-square', label: 'Rect' },
              { id: 'circle', icon: 'fa-circle', label: 'Circle' },
              { id: 'arrow', icon: 'fa-arrow-right', label: 'Arrow' },
              { id: 'line', icon: 'fa-minus', label: 'Line' },
              { id: 'note', icon: 'fa-sticky-note', label: 'Sticky Note' },
              { id: 'eraser', icon: 'fa-eraser', label: 'Eraser' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id as Tool)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 7,
                  border: 'none',
                  background: tool === t.id ? '#0284c7' : 'transparent',
                  color: tool === t.id ? '#ffffff' : '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.15s ease',
                }}
              >
                <i className={`fas ${t.icon}`}></i>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Color Palettes & Size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: c,
                    border: color === c ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.2)',
                    cursor: 'pointer',
                    boxShadow: color === c ? '0 0 8px ' + c : 'none',
                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                title="Custom Color"
                style={{ width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', marginLeft: 4 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 11 }}>
              <span>Size:</span>
              <input
                type="range"
                min="1"
                max="30"
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                style={{ width: 80, accentColor: '#0284c7', cursor: 'pointer' }}
              />
              <span style={{ minWidth: 20, color: '#f8fafc', fontWeight: 600 }}>{lineWidth}px</span>
            </div>
          </div>
        </div>

        {/* Canvas & Sticky Notes Work Area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0f172a' }}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              cursor: tool === 'eraser' ? 'cell' : tool === 'note' ? 'crosshair' : 'crosshair',
            }}
          />

          {/* Render Interactive Sticky Notes */}
          {stickyNotes.map((note) => (
            <div
              key={note.id}
              style={{
                position: 'absolute',
                left: `${(note.x / 1200) * 100}%`,
                top: `${(note.y / 700) * 100}%`,
                width: 170,
                background: note.color,
                color: '#1e293b',
                padding: '10px 12px',
                borderRadius: 6,
                boxShadow: '0 8px 18px rgba(0, 0, 0, 0.4)',
                transform: 'rotate(-1.5deg)',
                cursor: 'move',
                zIndex: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, opacity: 0.6, fontSize: 10, fontWeight: 700 }}>
                <span>NOTE</span>
                <button
                  onClick={() => setStickyNotes((prev) => prev.filter((n) => n.id !== note.id))}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#1e293b' }}
                >
                  ✕
                </button>
              </div>
              <textarea
                value={note.text}
                onChange={(e) => {
                  const val = e.target.value;
                  setStickyNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, text: val } : n)));
                }}
                style={{
                  width: '100%',
                  height: 60,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  color: '#1e293b',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WhiteboardModal;
