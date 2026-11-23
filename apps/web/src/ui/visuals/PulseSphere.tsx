import { useEffect, useRef } from 'react';
import { perfTier } from '../../lib/perf';

/**
 * Hero visual: a dotted sphere that beats like a heart while a scan band sweeps through it.
 * Canvas 2D, one draw per frame, paused when offscreen or with reduced motion.
 */
export function PulseSphere({ className = '', bpm = 72 }: { className?: string; bpm?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lite = perfTier === 'lite';
    const n = lite ? 380 : 820;
    const dpr = Math.min(lite ? 1 : 2, window.devicePixelRatio || 1);

    // Fibonacci sphere: even point spacing without clumping at the poles.
    const pts = Array.from({ length: n }, (_, i) => {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      return { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
    });

    let w = 0;
    let h = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let tiltX = 0;
    let tiltY = 0;
    const onMove = (e: PointerEvent) => {
      tiltY = (e.clientX / window.innerWidth - 0.5) * 0.5;
      tiltX = (e.clientY / window.innerHeight - 0.5) * 0.3;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    // Read colours where the canvas lives so dark panels (.chamber) get light dots.
    const css = getComputedStyle(canvas);
    const ink = () => css.getPropertyValue('--text').trim() || '#1d1d1f';
    const signal = () => css.getPropertyValue('--signal').trim() || '#0a84ff';
    const period = 60 / bpm;

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !reduce) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);

    let rx = 0;
    let ry = 0;
    function draw(now: number) {
      const t = now / 1000;
      ctx!.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.36;
      const cx = w / 2;
      const cy = h / 2;
      // Lub-dub: two quick bumps per beat.
      const phase = (t % period) / period;
      const beat = Math.exp(-((phase - 0.06) ** 2) / 0.0012) + 0.6 * Math.exp(-((phase - 0.22) ** 2) / 0.0015);
      const scale = 1 + 0.045 * beat;
      rx += (tiltX - rx) * 0.05;
      ry += (tiltY - ry) * 0.05;
      const a = t * 0.18 + ry;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cb = Math.cos(0.32 + rx);
      const sb = Math.sin(0.32 + rx);
      const band = Math.sin(t * 0.9) * 0.95; // scan band travels pole to pole
      const inkC = ink();
      const sigC = signal();
      for (const p of pts) {
        const x1 = p.x * ca - p.z * sa;
        const z1 = p.x * sa + p.z * ca;
        const y2 = p.y * cb - z1 * sb;
        const z2 = p.y * sb + z1 * cb;
        const depth = (z2 + 1) / 2;
        const inBand = Math.abs(p.y - band) < 0.06;
        const px = cx + x1 * R * scale;
        const py = cy + y2 * R * scale;
        const size = (0.6 + depth * 1.5) * (inBand ? 1.6 : 1);
        ctx!.globalAlpha = inBand ? 0.35 + depth * 0.65 : 0.08 + depth * 0.5;
        ctx!.fillStyle = inBand ? sigC : inkC;
        ctx!.beginPath();
        ctx!.arc(px, py, size, 0, Math.PI * 2);
        ctx!.fill();
      }
      // Echo ring on each beat.
      ctx!.globalAlpha = Math.max(0, 0.35 * (1 - phase * 2.2));
      ctx!.strokeStyle = sigC;
      ctx!.lineWidth = 1.2;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * (1.05 + phase * 0.5), 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.globalAlpha = 1;
      if (visible && !reduce) raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, [bpm]);

  return <canvas ref={ref} className={`block size-full ${className}`} aria-hidden />;
}
