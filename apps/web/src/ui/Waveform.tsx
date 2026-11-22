import { useEffect, useRef } from 'react';
import { perfTier } from '../lib/perf';

/**
 * Live pulse waveform on a canvas. Reads from a mutable ref every animation frame so the
 * camera loop never triggers React renders.
 */
export function Waveform({ source, color = '#FFFFFF', height = 72 }: { source: React.MutableRefObject<number[]>; color?: string; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(perfTier === 'lite' ? 1 : 2, window.devicePixelRatio || 1);
    let raf = 0;
    const resize = () => {
      el.width = el.clientWidth * dpr;
      el.height = height * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      const w = el.width;
      const h = el.height;
      ctx.clearRect(0, 0, w, h);
      const data = source.current.slice(-150);
      if (data.length > 2) {
        let min = Infinity;
        let max = -Infinity;
        for (const v of data) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const span = max - min || 1;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `${color}00`);
        grad.addColorStop(0.35, `${color}AA`);
        grad.addColorStop(1, color);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5 * dpr;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        data.forEach((v, i) => {
          const x = (i / (150 - 1)) * w;
          const y = h - ((v - min) / span) * (h * 0.8) - h * 0.1;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        const last = data[data.length - 1]!;
        const lx = ((data.length - 1) / 149) * w;
        const ly = h - ((last - min) / span) * (h * 0.8) - h * 0.1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lx, ly, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [source, color, height]);
  return <canvas ref={canvas} style={{ width: '100%', height }} aria-hidden />;
}
