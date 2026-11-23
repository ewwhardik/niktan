import { useEffect, useRef } from 'react';
import { perfTier } from '../lib/perf';

/** Live pulse data written by the capture loop; read every animation frame, never through React. */
export interface PulseFeed {
  /** Narrow-band, unit-variance pulse samples at 30 Hz, the last one at `waveEnd`. */
  wave: number[];
  waveEnd: number;
  /** Detected systolic peaks, on the capture clock (seconds). */
  beats: number[];
  /** performance.now()/1000 minus the capture clock, measured on the latest frame. */
  clockOffset: number;
  bpm: number | null;
}

export function emptyFeed(): PulseFeed {
  return { wave: [], waveEnd: 0, beats: [], clockOffset: 0, bpm: null };
}

const FS = 30;
const SPAN = 4.2;
// The trace is drawn this far behind real time so each new worker result extends it smoothly.
const LATENCY = 1.15;

/**
 * Patient-monitor style pulse trace. Successive worker windows are cross-faded into one continuous
 * signal that scrolls at real speed; when a detected beat reaches the read head, `onBeat` fires so
 * the heart and rings pulse in phase with the drawn peak.
 */
export function PulseMonitor({ feed, onBeat, color = '#FF453A', height = 64 }: { feed: React.MutableRefObject<PulseFeed>; onBeat?: (period: number) => void; color?: string; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const beatRef = useRef(onBeat);
  beatRef.current = onBeat;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const lite = perfTier === 'lite';
    const dpr = Math.min(lite ? 1 : 2, window.devicePixelRatio || 1);
    let w = 0;
    const resize = () => {
      w = el.clientWidth;
      el.width = Math.round(w * dpr);
      el.height = Math.round(height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let ts: number[] = [];
    let vs: number[] = [];
    let seenEnd = 0;
    let beats: number[] = [];
    let fired = -Infinity;
    let scale = 1.6;
    let raf = 0;

    const sampleAt = (t: number) => {
      if (!ts.length || t < ts[0]! || t > ts.at(-1)!) return null;
      const i = Math.min(ts.length - 2, Math.max(0, Math.floor((t - ts[0]!) * FS)));
      let j = i;
      while (j < ts.length - 2 && ts[j + 1]! < t) j++;
      while (j > 0 && ts[j]! > t) j--;
      const a = (t - ts[j]!) / Math.max(1e-6, ts[j + 1]! - ts[j]!);
      return vs[j]! + (vs[j + 1]! - vs[j]!) * Math.min(1, Math.max(0, a));
    };

    const merge = (f: PulseFeed) => {
      const n = f.wave.length;
      if (!n) return;
      const start = f.waveEnd - (n - 1) / FS;
      const oldEnd = ts.at(-1) ?? -Infinity;
      const keep = ts.findIndex((t) => t >= start);
      const nts: number[] = [];
      const nvs: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = start + i / FS;
        let v = f.wave[i]!;
        if (t <= oldEnd) {
          const old = sampleAt(t);
          if (old !== null) {
            const k = (t - start) / Math.max(1e-6, oldEnd - start);
            v = old * (1 - k) + v * k;
          }
        }
        nts.push(t);
        nvs.push(v);
      }
      ts = keep < 0 ? [...ts, ...nts] : [...ts.slice(0, keep), ...nts];
      vs = keep < 0 ? [...vs, ...nvs] : [...vs.slice(0, keep), ...nvs];
      for (const b of f.beats) if (!beats.some((x) => Math.abs(x - b) < 0.25)) beats.push(b);
      beats.sort((a, b) => a - b);
    };

    const draw = () => {
      const f = feed.current;
      if (!f.wave.length && ts.length) {
        ts = [];
        vs = [];
        beats = [];
        seenEnd = 0;
      }
      if (f.waveEnd !== seenEnd && f.wave.length) {
        seenEnd = f.waveEnd;
        merge(f);
      }
      const now = performance.now() / 1000 - f.clockOffset - LATENCY;
      const from = now - SPAN;
      while (ts.length > 2 && ts[1]! < from - 1) {
        ts.shift();
        vs.shift();
      }
      beats = beats.filter((b) => b > from - 1);

      // Keep the beat going between worker results by extending the last interval.
      const period = f.bpm ? 60 / f.bpm : 0;
      const last = beats.at(-1);
      if (period && last !== undefined && now > last + period * 0.98 && now - last < 3 * period && ts.length && ts.at(-1)! > now) beats.push(last + period);
      const due = beats.filter((b) => b <= now && b > fired);
      if (due.length) {
        fired = due.at(-1)!;
        if (now - fired < 0.25) beatRef.current?.(period || 0.8);
      }

      const h = height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Faint monitor grid.
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = w - ((now % 0.5) / SPAN) * w; gx > 0; gx -= (0.5 / SPAN) * w) {
        ctx.moveTo(Math.round(gx) + 0.5, 0);
        ctx.lineTo(Math.round(gx) + 0.5, h);
      }
      ctx.moveTo(0, h / 2 + 0.5);
      ctx.lineTo(w, h / 2 + 0.5);
      ctx.stroke();

      const points: [number, number][] = [];
      let peak = 0;
      const step = SPAN / Math.max(60, w / 2);
      for (let t = from; t <= now; t += step) {
        const v = sampleAt(t);
        if (v === null) continue;
        peak = Math.max(peak, Math.abs(v));
        points.push([((t - from) / SPAN) * w, v]);
      }
      // Ease the vertical scale so amplitude changes never make the trace jump.
      scale += ((peak > 0.2 ? peak : 1.6) - scale) * 0.06;
      const y = (v: number) => h / 2 - (v / (scale * 1.15)) * (h * 0.42);

      if (points.length > 2) {
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `${color}00`);
        grad.addColorStop(0.3, `${color}88`);
        grad.addColorStop(1, color);
        ctx.beginPath();
        ctx.moveTo(points[0]![0], y(points[0]![1]));
        for (let i = 1; i < points.length - 1; i++) {
          const [x0, v0] = points[i]!;
          const [x1, v1] = points[i + 1]!;
          ctx.quadraticCurveTo(x0, y(v0), (x0 + x1) / 2, y((v0 + v1) / 2));
        }
        const [lx, lv] = points.at(-1)!;
        ctx.lineTo(lx, y(lv));
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Beat ticks above each systolic peak, brightest at the read head.
        for (const b of beats) {
          if (b < from || b > now) continue;
          const bx = ((b - from) / SPAN) * w;
          const age = now - b;
          ctx.fillStyle = `rgba(255,255,255,${Math.max(0.18, 0.9 - age * 0.25)})`;
          ctx.fillRect(bx - 0.75, 4, 1.5, 6);
        }

        // Read head with a halo that swells on each beat.
        const pulse = Math.max(0, 1 - (now - fired) / 0.45);
        ctx.fillStyle = `${color}33`;
        ctx.beginPath();
        ctx.arc(lx, y(lv), 5 + 7 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(lx, y(lv), 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Searching: a calm baseline with a travelling shimmer.
        const sx = ((performance.now() / 1000) % 1.6) / 1.6 * w;
        const grad = ctx.createLinearGradient(sx - 80, 0, sx + 20, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0.12)');
        grad.addColorStop(0.8, `${color}cc`);
        grad.addColorStop(1, 'rgba(255,255,255,0.12)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [feed, color, height]);

  return <canvas ref={canvas} style={{ width: '100%', height }} aria-hidden />;
}

/** "Lub-dub" scale keyframes for a heart, timed to a fraction of the beat period. */
export function lubDub(el: Element | null, period: number) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.2)', offset: 0.14 },
      { transform: 'scale(0.97)', offset: 0.32 },
      { transform: 'scale(1.08)', offset: 0.46 },
      { transform: 'scale(1)' },
    ],
    { duration: Math.min(700, Math.max(320, period * 1000 * 0.75)), easing: 'cubic-bezier(.22,1,.36,1)' },
  );
}

/** One expanding ring per beat. */
export function ripple(el: Element | null, period: number) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate(
    [
      { transform: 'scale(0.9)', opacity: 0.65 },
      { transform: 'scale(1.9)', opacity: 0 },
    ],
    { duration: Math.max(600, period * 1000 * 1.3), easing: 'cubic-bezier(.22,1,.36,1)' },
  );
}
