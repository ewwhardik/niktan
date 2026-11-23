import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { Activity, Check, Ear, Eye, Glasses, Mic, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { perfTier } from '../../lib/perf';
import { StepVisual, type StepKey } from './StepVisual';

/** Accent per step: drives the glow under the phone, the chip dots and the screen tint. */
const ACCENT: Record<StepKey, string> = {
  face: '#ff453a',
  eye: '#64d2ff',
  vision: '#5e8bff',
  hearing: '#30d5c8',
  symptoms: '#bf5af2',
};

const ICONS: Record<StepKey, [LucideIcon, LucideIcon]> = {
  face: [Activity, ShieldCheck],
  eye: [Eye, Check],
  vision: [Glasses, Check],
  hearing: [Ear, Check],
  symptoms: [Mic, ShieldCheck],
};

/** Where the two floating chips sit around the phone, and how far they float in front of it. */
const SLOTS = [
  { style: { left: '78%', top: '20%' }, z: 90, delay: 0.08 },
  { style: { right: '80%', bottom: '18%' }, z: 60, delay: 0.16 },
] as const;

function Chip({ icon: Icon, label, value, accent, slot, reduce }: { icon: LucideIcon; label: string; value: string; accent: string; slot: (typeof SLOTS)[number]; reduce: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute z-10"
      style={{ ...slot.style, transform: `translateZ(${slot.z}px)` }}
      initial={reduce ? false : { opacity: 0, y: 18, scale: 0.92, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={reduce ? undefined : { opacity: 0, y: -10, scale: 0.96, filter: 'blur(6px)', transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: slot.delay }}
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 4.5 + slot.delay * 10, repeat: Infinity, ease: 'easeInOut' }}
        className="flex items-center gap-3 rounded-2xl px-4 py-3 whitespace-nowrap shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)] ring-1 ring-white/12 backdrop-blur-xl"
        style={{ background: 'linear-gradient(140deg, rgba(44,44,48,0.82), rgba(22,22,24,0.72))' }}
      >
        <span className="grid size-9 place-items-center rounded-xl" style={{ background: `${accent}26`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }}>
          <Icon size={17} strokeWidth={2} aria-hidden />
        </span>
        <span className="leading-tight">
          <span className="block text-[11px] tracking-[0.08em] text-white/55 uppercase">{label}</span>
          <span className="block text-[15px] font-semibold text-white">{value}</span>
        </span>
      </motion.div>
    </motion.div>
  );
}

/** Thin, stacked copies of the body behind the face give the frame real thickness when it turns. */
function Thickness({ layers = 7 }: { layers?: number }) {
  return (
    <>
      {Array.from({ length: layers }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-0 rounded-[48px]"
          style={{ transform: `translateZ(${-(i + 1) * 1.6}px)`, background: i === layers - 1 ? '#0b0b0c' : `linear-gradient(145deg, #4a4a4e, #1c1c1e 45%, #3a3a3d)` }}
        />
      ))}
    </>
  );
}

export interface StageStep { k: StepKey; t: string }

/**
 * A floating 3D phone for "How it works": metal frame with depth, glass glare that follows the tilt,
 * pointer and scroll parallax, an accent glow per step, and glass data chips floating in front.
 */
export function DeviceStage({ steps, active, scrollTilt }: { steps: StageStep[]; active: number; scrollTilt: MotionValue<number> }) {
  const { t } = useTranslation();
  const reduce = !!useReducedMotion() || perfTier === 'lite';
  const step = steps[active]!;
  const accent = ACCENT[step.k];

  // Pointer parallax, smoothed with springs so the phone glides rather than tracks.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 90, damping: 18 });
  const sy = useSpring(py, { stiffness: 90, damping: 18 });
  const rotateY = useTransform([sx, scrollTilt] as MotionValue<number>[], ([x, s]) => (reduce ? 0 : (x as number) * 14 + (s as number) * 2.4 - 14));
  const rotateX = useTransform(sy, (y) => (reduce ? 0 : 6 - y * 9));
  const glareX = useTransform(sx, [-1, 1], [-30, 130]);
  const glareFrom = useTransform(glareX, (g) => g - 30);
  const glareTo = useTransform(glareX, (g) => g + 22);
  const glare = useMotionTemplate`linear-gradient(115deg, transparent ${glareFrom}%, rgba(255,255,255,0.16) ${glareX}%, transparent ${glareTo}%)`;

  const chips = t(`home.stage.${step.k}`, { returnObjects: true }) as { label: string; value: string }[];

  return (
    <div
      className="relative mx-auto flex h-[min(70svh,600px)] w-full items-center justify-center"
      style={{ perspective: 1400 }}
      onPointerMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set(((e.clientX - r.left) / r.width) * 2 - 1);
        py.set(((e.clientY - r.top) / r.height) * 2 - 1);
      }}
      onPointerLeave={() => { px.set(0); py.set(0); }}
    >
      {/* Accent glow and a soft contact shadow under the phone. */}
      <motion.div aria-hidden className="absolute top-[18%] left-1/2 h-[64%] w-[78%] -translate-x-1/2 rounded-full blur-[90px]" animate={{ backgroundColor: accent, opacity: 0.32 }} transition={{ duration: 0.8 }} />
      <motion.div aria-hidden className="absolute bottom-[2%] left-1/2 h-8 w-[46%] -translate-x-1/2 rounded-[50%] bg-black blur-xl" animate={reduce ? { opacity: 0.55 } : { opacity: [0.55, 0.35, 0.55], scaleX: [1, 0.86, 1] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />

      <motion.div
        className="relative aspect-[9/18.6] h-[min(62svh,530px)]"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        animate={reduce ? undefined : { y: [0, -14, 0], rotateZ: [-0.6, 0.6, -0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Thickness />
        {/* Frame: brushed metal rim with a bright upper edge. */}
        <div className="absolute inset-0 rounded-[48px] p-[9px] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.75)]"
          style={{ background: 'linear-gradient(145deg, #5a5a5f 0%, #1d1d1f 38%, #2c2c2e 62%, #6a6a70 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
          {/* Side buttons. */}
          <span aria-hidden className="absolute top-[22%] -left-[3px] h-12 w-[3px] rounded-l bg-[#3a3a3d]" />
          <span aria-hidden className="absolute top-[31%] -left-[3px] h-12 w-[3px] rounded-l bg-[#3a3a3d]" />
          <span aria-hidden className="absolute top-[26%] -right-[3px] h-20 w-[3px] rounded-r bg-[#3a3a3d]" />

          <div className="chamber relative size-full overflow-hidden rounded-[40px] bg-black text-white ring-1 ring-black">
            {/* Screen tint follows the step accent. */}
            <motion.div aria-hidden className="absolute inset-0" animate={{ background: `radial-gradient(90% 60% at 50% 38%, ${accent}2e 0%, #000 72%)` }} transition={{ duration: 0.7 }} />
            <div aria-hidden className="absolute inset-x-0 top-3 z-10 mx-auto h-[26px] w-[92px] rounded-full bg-black ring-1 ring-white/5" />
            <div className="absolute inset-x-5 top-12 z-10 flex items-center justify-between text-[11px] text-white/60">
              <span className="mono tracking-[0.14em] uppercase">0{active + 1} / 0{steps.length}</span>
              <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: accent }} />{t('home.stage.live')}</span>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={step.k}
                className="absolute inset-0 flex flex-col items-center justify-center px-7 pt-10 pb-16"
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.94, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -40, scale: 0.96, filter: 'blur(10px)' }}
                transition={{ type: 'spring', stiffness: 200, damping: 26 }}
              >
                <StepVisual step={step.k} className="w-full" />
                <p className="mt-2 text-center text-[13px] font-medium text-white/80">{step.t}</p>
              </motion.div>
            </AnimatePresence>
            <div aria-hidden className="absolute inset-x-6 bottom-7 flex gap-1">
              {steps.map((s, i) => (
                <span key={s.k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                  <motion.span className="block h-full origin-left rounded-full" initial={false} animate={{ scaleX: i <= active ? 1 : 0, backgroundColor: i === active ? accent : '#ffffff' }} transition={{ duration: 0.45 }} />
                </span>
              ))}
            </div>
            {/* Glass glare that slides with the tilt. */}
            {!reduce && <motion.div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-screen" style={{ background: glare }} />}
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[40px] ring-1 ring-inset ring-white/10" />
          </div>
        </div>

        {/* Glass chips floating in front of the phone. */}
        <AnimatePresence>
          {chips.slice(0, 2).map((c, i) => (
            <Chip key={`${step.k}-${i}`} icon={ICONS[step.k][i]!} label={c.label} value={c.value} accent={accent} slot={SLOTS[i]!} reduce={reduce} />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
