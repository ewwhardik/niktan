import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Interaction primitives adapted from the CIT Scheduler landing: a card that tilts toward the pointer
 * with a soft light under it, a control that drifts toward the pointer, and text that decodes into
 * place. All are pointer-only, skip touch, and do nothing with reduced motion.
 */

function reduced() {
  return typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TiltCard({ children, className = '', max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  function move(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || e.pointerType === 'touch' || reduced()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  }
  function leave() {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  }
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={`fx-tilt ${className}`}>
      <span aria-hidden className="fx-spot" />
      {children}
    </div>
  );
}

/** Wraps a button or link so it leans a little toward the pointer, then springs back. */
export function Magnetic({ children, strength = 0.22 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  function move(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || e.pointerType === 'touch' || reduced()) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength * 1.3}px)`;
  }
  return (
    <span ref={ref} onPointerMove={move} onPointerLeave={() => { if (ref.current) ref.current.style.transform = ''; }} className="fx-magnet inline-flex">
      {children}
    </span>
  );
}

const GLYPHS = '·•◦-–_/\\|01';

/** Text that resolves from quiet glyphs into place the first time it scrolls into view. */
export function Decode({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const run = (now: number) => {
        const done = (now - t0) / 24;
        let out = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i]!;
          out += ch === ' ' || i < done - 5 ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        el.textContent = out;
        if (done - 5 < text.length) raf = requestAnimationFrame(run);
        else el.textContent = text;
      };
      raf = requestAnimationFrame(run);
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [text]);
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden>{text}</span>
    </span>
  );
}
