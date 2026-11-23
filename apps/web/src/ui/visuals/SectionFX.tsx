import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { DoorOpen, Siren } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { perfTier } from '../../lib/perf';

/**
 * Section-level effects for the landing page. Each section gets its own treatment so the page does
 * not repeat one trick: rolling digits for the evidence, a live priority queue for the problem and
 * a heartbeat line for the close. No glows: depth comes from neutral shadows and motion.
 * Everything settles to a still, readable frame with reduced motion or on budget phones.
 */

const still = () => perfTier === 'lite';

/* ------------------------------------------------------------------ */
/* Odometer: each digit rolls on its own wheel                          */
/* ------------------------------------------------------------------ */

const WHEEL = Array.from({ length: 20 }, (_, i) => i % 10);

export function Odometer({ value, decimals = 0, className = '' }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-12% 0px' });
  const reduce = useReducedMotion();
  const text = value.toFixed(decimals);
  const digits = text.split('');
  return (
    <span ref={ref} className={`tnum inline-flex ${className}`}>
      <span className="sr-only">{text}</span>
      {digits.map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} aria-hidden>{ch}</span>;
        const d = Number(ch);
        // Roll past a full turn so even a 0 visibly spins; later digits land a little later.
        const target = 10 + d;
        return (
          <span key={i} aria-hidden className="relative inline-block h-[1em] overflow-hidden leading-none">
            <motion.span
              className="flex flex-col"
              initial={false}
              animate={{ y: reduce || inView ? `-${(target / 20) * 100}%` : '0%' }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 38, damping: 14, mass: 1 + i * 0.18, delay: i * 0.08 }}
            >
              {WHEEL.map((n, k) => <span key={k} className="block h-[1em] leading-none">{n}</span>)}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Priority queue: the breathless patient lifts out of line to the top  */
/* ------------------------------------------------------------------ */

const ROW = 62;
const FCFS = [0, 1, 2, 4, 3];
const PRIORITY = [3, 0, 1, 2, 4];

/**
 * Five tokens in a tilted lane. A scan passes down the line, flags the breathless patient who
 * arrived last, and they glide from the back to the front. Loops while on screen.
 */
export function PriorityQueue({ tags, labels }: { tags: string[]; labels: { fcfs: string; niktan: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-10% 0px' });
  const reduce = useReducedMotion() || still();
  // 0 first-come · 1 scanning · 2 flagged · 3 reordered
  const [phase, setPhase] = useState(reduce ? 3 : 0);
  useEffect(() => {
    if (reduce || !inView) return;
    const steps: [number, number][] = [[0, 1400], [1, 1500], [2, 900], [3, 3600]];
    let i = steps.findIndex(([p]) => p === phase);
    let id = 0;
    const tick = () => {
      i = (i + 1) % steps.length;
      setPhase(steps[i]![0]);
      id = window.setTimeout(tick, steps[i]![1]);
    };
    id = window.setTimeout(tick, steps[Math.max(0, i)]![1]);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, inView]);

  const order = phase === 3 ? PRIORITY : FCFS;
  const sorted = phase === 3;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[560px] [perspective:1400px]">
      <div className="relative rounded-[26px] bg-sunken p-3 ring-1 ring-[var(--lp-line)] [transform-style:preserve-3d] sm:p-4 lg:[transform:rotateX(14deg)_rotateY(-14deg)_rotateZ(1.5deg)]">
        {/* Header: who is being served, and by which rule. */}
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-text text-bg"><DoorOpen size={16} aria-hidden /></span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={sorted ? 'n' : 'f'} initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }} transition={{ duration: 0.3 }}
              className={`text-label font-semibold ${sorted ? 'text-[var(--lp-accent)]' : 'text-text-2'}`}>
              {sorted ? labels.niktan : labels.fcfs}
            </motion.span>
          </AnimatePresence>
          <span className="mono ml-auto text-caption text-text-3">OPD · 10:42</span>
        </div>

        <div className="relative" style={{ height: ROW * 5 - 10 }}>
          {[0, 1, 2, 3, 4].map((p) => {
            const slot = order.indexOf(p);
            const red = p === 3;
            const flagged = red && phase >= 2;
            const lifted = red && phase === 3;
            return (
              <motion.div
                key={p}
                className={`absolute inset-x-0 flex h-[52px] items-center gap-3 rounded-2xl px-3.5 ${red && phase >= 1 ? 'z-10' : ''} ${flagged ? 'bg-emergency-tint' : 'bg-bg'} ring-1 ${flagged ? 'ring-[var(--emergency)]/40' : 'ring-[var(--lp-line)]'}`}
                initial={false}
                animate={{
                  y: slot * ROW,
                  x: lifted ? [36, 36, 0] : 0,
                  scale: flagged ? 1.03 : 1,
                  boxShadow: flagged ? '0 14px 30px -16px rgba(0,0,0,0.35)' : '0 0 0 rgba(0,0,0,0)',
                }}
                transition={reduce ? { duration: 0 } : { y: { type: 'spring', stiffness: 120, damping: 20, delay: lifted ? 0.25 : 0 }, x: { duration: 1.1, times: [0, 0.25, 1], ease: 'easeInOut' }, default: { duration: 0.35 } }}
              >
                <span className={`mono w-9 shrink-0 text-caption ${flagged ? 'text-emergency-ink' : 'text-text-3'}`}>#{11 + FCFS.indexOf(p)}</span>
                <span className={`line-clamp-2 min-w-0 flex-1 text-[13px] leading-tight font-medium sm:text-label ${flagged ? 'text-emergency-ink' : 'text-text-2'}`}>{tags[p]}</span>
                {red && !lifted && (
                  <motion.span initial={false} animate={{ opacity: flagged ? 1 : 0, scale: flagged ? 1 : 0.6 }} className="grid size-7 shrink-0 place-items-center rounded-full bg-emergency text-emergency-on">
                    <Siren size={14} aria-hidden />
                  </motion.span>
                )}
                <AnimatePresence>
                  {lifted && (
                    <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0, transition: { delay: reduce ? 0 : 0.9 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      className="shrink-0 rounded-full bg-[var(--lp-accent)] px-2.5 py-1 text-caption font-semibold whitespace-nowrap text-white">
                      {tags[5]}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {/* The scan: a soft beam that reads each token in turn. */}
          {!reduce && (
            <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 h-14 -translate-y-1/2"
              initial={false}
              animate={phase === 1 ? { top: ['0%', '100%'], opacity: [0, 1, 1, 0] } : { opacity: 0 }}
              transition={phase === 1 ? { duration: 1.4, ease: 'easeInOut' } : { duration: 0.2 }}>
              <span className="absolute inset-x-2 top-1/2 h-[1.5px] rounded-full bg-[var(--lp-accent)]" />
            </motion.div>
          )}
        </div>
      </div>
      {/* Floor shadow so the tilted lane sits on the card. */}
      <div aria-hidden className="mx-auto mt-2 hidden h-6 w-[80%] rounded-[50%] bg-black/20 blur-xl lg:block" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heartbeat horizon: a pulse runs the width of the closing section     */
/* ------------------------------------------------------------------ */

function ecg(width: number, beat: number, mid: number) {
  let d = `M0 ${mid}`;
  for (let x = 0; x < width; x += beat) {
    d += ` H${x + beat * 0.36} l6 -6 l6 6 H${x + beat * 0.46} l5 10 l9 -64 l9 82 l7 -28 H${x + beat * 0.66} q12 -16 24 0 H${x + beat}`;
  }
  return d;
}

export function EcgHorizon({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion() || still();
  const d = ecg(1600, 400, 90);
  return (
    <svg viewBox="0 0 1600 160" preserveAspectRatio="xMidYMid slice" className={`pointer-events-none ${className}`} aria-hidden>
      <defs>
        <mask id="ecg-mask"><rect width="1600" height="160" fill="url(#ecg-edge)" /></mask>
        <linearGradient id="ecg-edge" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.15" stopColor="#fff" />
          <stop offset="0.85" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g mask="url(#ecg-mask)">
        <path d={d} fill="none" stroke="var(--lp-line)" strokeWidth="1.5" />
        {!reduce && (
          <>
            <path className="fx-ecg-run" pathLength={1000} d={d} fill="none" stroke="var(--lp-heart)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scroll tilt: a product shot that turns to face you as it arrives     */
/* ------------------------------------------------------------------ */

export function ScrollTilt({ children, className = '', from = { x: 12, y: -22 } }: { children: ReactNode; className?: string; from?: { x: number; y: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center 55%'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [from.x, 3]);
  const rotateY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [from.y, -6]);
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.9, 1]);
  return (
    <div ref={ref} className="[perspective:1400px]">
      <motion.div style={{ rotateX, rotateY, scale }} className={className}>{children}</motion.div>
    </div>
  );
}
