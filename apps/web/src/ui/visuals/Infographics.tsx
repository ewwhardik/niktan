import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { Ban, CircleUser, DoorOpen, Ear, Eye, Glasses, HeartPulse, Lock, Server, Smartphone, Stethoscope } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ease } from '../motion';

/* ------------------------------------------------------------------ */
/* Queue race: first-come-first-served vs NikTan priority              */
/* ------------------------------------------------------------------ */

const LANE = 14;

/**
 * Two OPD lines served at the same pace. In the first-come line the breathless patient (red)
 * arrived last and waits behind everyone; NikTan lifts them to the front. Illustrative only.
 */
export function QueueRace({ labels }: { labels: { fcfs: string; niktan: string; wait: string; note: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-15% 0px' });
  const reduce = useReducedMotion();
  const [served, setServed] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const id = setInterval(() => setServed((n) => (n >= LANE ? 0 : n + 1)), 650);
    return () => clearInterval(id);
  }, [inView, reduce]);

  const lane = (priority: boolean) => {
    // Each patient is an id; red is #LANE-1 (arrived last).
    const order = Array.from({ length: LANE }, (_, i) => i);
    const sorted = priority ? [LANE - 1, ...order.slice(0, -1)] : order;
    const remaining = sorted.slice(served);
    const redServed = !remaining.includes(LANE - 1);
    const redWaitSlots = sorted.indexOf(LANE - 1);
    return (
      <div className="rounded-2xl bg-surface p-4 ring-1 ring-border sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-label font-semibold">{priority ? labels.niktan : labels.fcfs}</p>
          <p className={`mono text-caption ${priority ? 'text-routine-text' : 'text-emergency-text'}`}>
            {labels.wait.replace('{{n}}', String(redWaitSlots * 6))}
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent" title="Doctor">
            <DoorOpen size={18} aria-hidden />
          </span>
          <div className="relative flex min-h-8 flex-1 items-center gap-1 overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              {remaining.map((id) => {
                const red = id === LANE - 1;
                return (
                  <motion.span
                    key={id}
                    layout
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: -24, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    className={`relative flex size-6 shrink-0 items-center justify-center rounded-full sm:size-7 ${red ? 'bg-emergency text-emergency-on' : 'bg-sunken text-text-3'}`}
                  >
                    <CircleUser size={14} aria-hidden />
                    {red && <span className="absolute inset-0 animate-ping rounded-full bg-emergency/40" />}
                  </motion.span>
                );
              })}
            </AnimatePresence>
          </div>
          <span className={`mono w-12 shrink-0 text-right text-caption ${redServed ? 'text-routine-text' : 'text-text-3'}`}>{redServed ? '✓' : `${remaining.length}`}</span>
        </div>
      </div>
    );
  };

  return (
    <div ref={ref} className="flex flex-col gap-3">
      {lane(false)}
      {lane(true)}
      <p className="text-caption text-text-3">{labels.note}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Time donut: share of the visit spent with the doctor                */
/* ------------------------------------------------------------------ */

export function TimeDonut({ wait, consult, labels }: { wait: number; consult: number; labels: { wait: string; consult: string } }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const total = wait + consult;
  const r = 70;
  const c = 2 * Math.PI * r;
  const share = consult / total;
  return (
    <div className="flex items-center gap-6">
      <svg ref={ref} viewBox="0 0 180 180" className="size-40 shrink-0 -rotate-90 sm:size-48" aria-hidden>
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="22" />
        <motion.circle cx="90" cy="90" r={r} fill="none" stroke="var(--text-3)" strokeWidth="22" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={inView ? { strokeDashoffset: c * share } : {}} transition={{ duration: 1.4, ease }} />
        <motion.circle cx="90" cy="90" r={r} fill="none" stroke="var(--emergency)" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.3, duration: 0.4 }} />
      </svg>
      <ul className="flex flex-col gap-3 text-body">
        <li className="flex items-center gap-3">
          <span className="size-3 rounded-full bg-text-3" />
          <span>
            <span className="tnum font-semibold">{wait} min</span> <span className="text-text-2">{labels.wait}</span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="size-3 rounded-full bg-emergency" />
          <span>
            <span className="tnum font-semibold">{consult} min</span> <span className="text-text-2">{labels.consult}</span>
          </span>
        </li>
        <li className="mono text-caption text-text-3">{Math.round(share * 1000) / 10}% of the visit with a doctor</li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy data flow: what stays on the phone, what leaves            */
/* ------------------------------------------------------------------ */

export function DataFlow({ labels, compact = false }: { labels: { phone: string; server: string; stays: string; sent: string; never: string; items: string[]; sentItems: string[]; neverItems: string[] }; compact?: boolean }) {
  const reduce = useReducedMotion();
  const icons = [HeartPulse, Eye, Glasses, Ear];
  return (
    <div className={`grid items-center gap-4 ${compact ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-1 sm:grid-cols-[1fr_auto_1fr]'}`}>
      {/* Phone */}
      <div className="relative rounded-[28px] bg-[#0b0b0c] p-2 text-white shadow-3">
        <div className="rounded-[22px] bg-[radial-gradient(120%_80%_at_50%_0%,#18242c,#050607)] p-4">
          <div className="flex items-center gap-2 text-caption text-white/60">
            <Smartphone size={14} aria-hidden /> {labels.phone}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {labels.items.map((it, i) => {
              const Icon = icons[i % icons.length]!;
              return (
                <div key={it} className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-2 text-[12px] ring-1 ring-white/10">
                  <Icon size={14} className="shrink-0 text-[var(--signal)]" aria-hidden />
                  <span className="truncate">{it}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#5EF0C8]">
            <Lock size={12} aria-hidden /> {labels.stays}
          </div>
        </div>
      </div>

      {/* Packets */}
      <div className={`relative flex items-center justify-center ${compact ? 'h-24 w-14' : 'h-16 sm:h-24 sm:w-20'}`} aria-hidden>
        <span className={`absolute bg-border ${compact ? 'inset-x-0 top-1/2 h-px' : 'inset-y-0 left-1/2 w-px sm:inset-x-0 sm:inset-y-auto sm:top-1/2 sm:left-0 sm:h-px sm:w-auto'}`} />
        {!reduce &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute size-2 rounded-full bg-[var(--signal)] shadow-[0_0_10px_var(--signal)]"
              animate={compact ? { x: [-24, 24], opacity: [0, 1, 0] } : { x: [-28, 28], opacity: [0, 1, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: 'easeInOut' }}
            />
          ))}
        <span className="mono absolute -bottom-1 text-[10px] whitespace-nowrap text-text-3">{labels.sent}</span>
      </div>

      {/* Server */}
      <div className="rounded-[28px] bg-surface p-4 ring-1 ring-border">
        <div className="flex items-center gap-2 text-caption text-text-2">
          <Server size={14} aria-hidden /> {labels.server}
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {labels.sentItems.map((it) => (
            <li key={it} className="mono rounded-full bg-sunken px-2.5 py-1 text-[11px]">
              {it}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-text-3">{labels.never}</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {labels.neverItems.map((it) => (
            <li key={it} className="inline-flex items-center gap-1 rounded-full bg-emergency-tint px-2.5 py-1 text-[11px] text-emergency-ink line-through decoration-1">
              <Ban size={11} aria-hidden /> {it}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Queue line for the token screen                                     */
/* ------------------------------------------------------------------ */

export function QueueLine({ ahead, you }: { ahead: number; you: string }) {
  const shown = Math.min(ahead, 8);
  return (
    <div className="flex items-end gap-1.5" aria-hidden>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
        <Stethoscope size={18} />
      </span>
      <div className="flex flex-1 items-end gap-1 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {Array.from({ length: shown }, (_, i) => (
            <motion.span key={`p${ahead - i}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sunken text-text-3">
              <CircleUser size={15} />
            </motion.span>
          ))}
        </AnimatePresence>
        {ahead > shown && <span className="mono self-center px-1 text-caption text-text-3">+{ahead - shown}</span>}
        <motion.span layout className="relative flex shrink-0 flex-col items-center">
          <span className="mb-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-on-accent">{you}</span>
          <span className="relative flex size-9 items-center justify-center rounded-full bg-[var(--signal)] text-white">
            <CircleUser size={18} />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--signal)]/40" />
          </span>
        </motion.span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nutrient rings for the thali result                                 */
/* ------------------------------------------------------------------ */

export function NutrientRings({ rings, center }: { rings: { label: string; share: number; color: string }[]; center: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div className="flex items-center gap-5">
      <svg ref={ref} viewBox="0 0 200 200" className="size-44 shrink-0 -rotate-90" aria-hidden>
        {rings.map((ring, i) => {
          const r = 88 - i * 18;
          const c = 2 * Math.PI * r;
          const s = Math.min(1, ring.share);
          return (
            <g key={ring.label}>
              <circle cx="100" cy="100" r={r} fill="none" stroke={ring.color} strokeOpacity="0.15" strokeWidth="13" />
              <motion.circle cx="100" cy="100" r={r} fill="none" stroke={ring.color} strokeWidth="13" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={inView ? { strokeDashoffset: c * (1 - s) } : {}} transition={{ duration: 1.2, ease, delay: i * 0.12 }} />
            </g>
          );
        })}
        <text x="100" y="100" transform="rotate(90 100 100)" textAnchor="middle" dominantBaseline="middle" className="tnum" fontSize="18" fontWeight="600" fill="currentColor">
          {center}
        </text>
      </svg>
      <ul className="flex flex-col gap-2 text-body">
        {rings.map((ring) => (
          <li key={ring.label} className="flex items-center gap-2.5">
            <span className="size-3 rounded-full" style={{ background: ring.color }} />
            <span className="text-text-2">{ring.label}</span>
            <span className="tnum font-semibold">{Math.round(ring.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
