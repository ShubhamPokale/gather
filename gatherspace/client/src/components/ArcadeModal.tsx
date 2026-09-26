// client/src/components/ArcadeModal.tsx
// Retro Cyber Arcade Mini-Game for the Breakroom & Gaming Lounge.

import React, { useRef, useEffect, useState } from 'react';

interface ArcadeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArcadeModal: React.FC<ArcadeModalProps> = ({ isOpen, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(120);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    if (!isOpen || !gameStarted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let paddleX = 160;
    const paddleW = 80;
    const paddleH = 12;

    let ballX = 200;
    let ballY = 200;
    let ballDx = 3.5;
    let ballDy = -3.5;
    const ballR = 6;
    let curScore = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      paddleX = Math.max(0, Math.min(canvas.width - paddleW, e.clientX - rect.left - paddleW / 2));
    };

    window.addEventListener('mousemove', handleMouseMove);

    const loop = () => {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Cyber Grid
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 25) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 25) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Move ball
      ballX += ballDx;
      ballY += ballDy;

      // Bounce walls
      if (ballX - ballR <= 0 || ballX + ballR >= canvas.width) {
        ballDx = -ballDx;
      }
      if (ballY - ballR <= 0) {
        ballDy = -ballDy;
      }

      // Paddle collision
      if (
        ballY + ballR >= canvas.height - paddleH - 20 &&
        ballY - ballR <= canvas.height - 20 &&
        ballX >= paddleX &&
        ballX <= paddleX + paddleW
      ) {
        ballDy = -Math.abs(ballDy);
        curScore += 10;
        setScore(curScore);
        if (curScore > highScore) setHighScore(curScore);
        ballDx *= 1.02;
        ballDy *= 1.02;
      }

      // Bottom fall
      if (ballY + ballR > canvas.height) {
        setGameOver(true);
        setGameStarted(false);
        return;
      }

      // Draw Paddle (Neon Emerald)
      ctx.fillStyle = '#10b981';
      ctx.shadowColor = '#34d399';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(paddleX, canvas.height - paddleH - 20, paddleW, paddleH, 6);
      ctx.fill();

      // Draw Ball (Neon Gold)
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animId);
    };
  }, [isOpen, gameStarted, highScore]);

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
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#090d16',
          borderRadius: 24,
          border: '1px solid rgba(16, 185, 129, 0.4)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>👾</span>
            <div style={{ textAlign: 'left' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#34d399', letterSpacing: '0.05em' }}>CYBER DEFENDER</h3>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>GatherSpace Chill Lounge Arcade</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 12, fontWeight: 700 }}>
          <span style={{ color: '#cbd5e1' }}>SCORE: <strong style={{ color: '#34d399' }}>{score}</strong></span>
          <span style={{ color: '#cbd5e1' }}>HIGH SCORE: <strong style={{ color: '#fbbf24' }}>{highScore}</strong></span>
        </div>

        <div style={{ position: 'relative', width: 400, height: 340, background: '#020617', borderRadius: 16, border: '2px solid rgba(16, 185, 129, 0.3)', overflow: 'hidden' }}>
          <canvas ref={canvasRef} width={400} height={340} style={{ display: 'block', width: '100%', height: '100%' }} />

          {!gameStarted && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(2, 6, 23, 0.85)', padding: 20 }}>
              <h4 style={{ color: '#f8fafc', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
                {gameOver ? '💥 GAME OVER' : '🕹️ READY TO PLAY?'}
              </h4>
              <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 18 }}>Move mouse to guide your cyber paddle & deflect the data pulse!</p>
              <button
                onClick={() => {
                  setScore(0);
                  setGameOver(false);
                  setGameStarted(true);
                }}
                style={{
                  padding: '10px 24px',
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.4)',
                }}
              >
                {gameOver ? 'Play Again' : 'Start Game'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArcadeModal;
