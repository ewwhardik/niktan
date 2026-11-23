import { useEffect, useRef } from 'react';

/** Mirrored frequency bars read from an AnalyserNode on each animation frame. */
export function SoundBars({ analyser, active, className = '' }: { analyser: AnalyserNode | null | undefined; active: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 64);
    let raf = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (now: number) => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (analyser && active) analyser.getByteFrequencyData(data);
      const bars = 32;
      const gap = 4;
      const bw = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        const idle = reduce ? 0.06 : 0.06 + 0.04 * Math.sin(now / 400 + i * 0.5);
        const v = active && analyser ? (data[Math.floor((i / bars) * data.length * 0.7)] ?? 0) / 255 : idle;
        const bh = Math.max(3, v * h);
        ctx.fillStyle = i % 8 === 3 ? '#5EF0C8' : 'rgba(100,210,255,0.85)';
        ctx.globalAlpha = 0.35 + v * 0.65;
        ctx.beginPath();
        ctx.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // With reduced motion, only redraw while sound is actually playing.
      if (!reduce || active) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return <canvas ref={ref} className={`block w-full ${className}`} aria-hidden />;
}
