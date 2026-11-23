import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { ScreeningStep } from '../../state/scan';

export type StepKey = ScreeningStep;

const loop = { repeat: Infinity, ease: 'easeInOut' as const };

/** Dot grid clipped to a face oval, a scan line, and a live trace: what the face scan feels like. */
function FaceViz() {
  const dots: { x: number; y: number }[] = [];
  for (let y = 30; y <= 170; y += 9) for (let x = 40; x <= 160; x += 9) if (((x - 100) / 58) ** 2 + ((y - 100) / 72) ** 2 <= 1) dots.push({ x, y });
  return (
    <svg viewBox="0 0 200 220" className="size-full">
      <ellipse cx="100" cy="100" rx="64" ry="80" fill="none" stroke="currentColor" strokeOpacity=".25" strokeDasharray="2 5" />
      {dots.map((d, i) => (
        <motion.circle key={i} cx={d.x} cy={d.y} r="1.3" fill="currentColor" initial={{ opacity: 0.15 }} animate={{ opacity: [0.15, 0.7, 0.15] }} transition={{ ...loop, duration: 2.6, delay: (d.y - 30) / 120 }} />
      ))}
      <motion.rect x="34" width="132" height="2" rx="1" fill="var(--signal)" animate={{ y: [24, 176, 24] }} transition={{ ...loop, duration: 2.6 }} />
      <motion.path d="M20 200h40l8-14 10 26 10-20 6 8h86" fill="none" stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1] }} transition={{ ...loop, duration: 1.8 }} />
    </svg>
  );
}

function EyeViz() {
  return (
    <svg viewBox="0 0 200 220" className="size-full">
      <path d="M30 110 Q100 50 170 110 Q100 170 30 110Z" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.5" />
      <circle cx="100" cy="110" r="26" fill="none" stroke="currentColor" strokeOpacity=".6" />
      <circle cx="100" cy="110" r="10" fill="currentColor" />
      {[0, 90, 180, 270].map((r) => (
        <motion.path key={r} d="M66 76 h12 M66 76 v12" stroke="var(--signal)" strokeWidth="2.5" strokeLinecap="round" fill="none" style={{ rotate: r, originX: '100px', originY: '110px' }} animate={{ scale: [1.35, 1, 1, 1.35] }} transition={{ ...loop, duration: 2.4, times: [0, 0.35, 0.8, 1] }} />
      ))}
      <motion.text x="100" y="190" textAnchor="middle" className="mono" fontSize="10" fill="var(--signal)" animate={{ opacity: [0, 1, 1, 0] }} transition={{ ...loop, duration: 2.4, times: [0, 0.35, 0.8, 1] }}>
        IRIS LOCKED
      </motion.text>
    </svg>
  );
}

function VisionViz() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % 8), 900);
    return () => clearInterval(id);
  }, []);
  const size = 70 - (i % 4) * 14;
  return (
    <svg viewBox="0 0 200 220" className="size-full">
      <rect x="40" y="40" width="120" height="120" rx="18" fill="white" />
      <AnimatePresence mode="wait">
        <motion.g key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ originX: '100px', originY: '100px' }}>
          <g transform={`translate(${100 - size / 2} ${100 - size / 2}) rotate(${(i * 90) % 360} ${size / 2} ${size / 2})`} fill="#000">
            <rect width={size / 5} height={size} />
            <rect width={size} height={size / 5} />
            <rect y={(2 * size) / 5} width={size} height={size / 5} />
            <rect y={(4 * size) / 5} width={size} height={size / 5} />
          </g>
        </motion.g>
      </AnimatePresence>
      <text x="100" y="192" textAnchor="middle" className="mono" fontSize="10" fill="currentColor" opacity=".6">
        6/{[60, 36, 18, 9][i % 4]}
      </text>
    </svg>
  );
}

function HearingViz() {
  return (
    <svg viewBox="0 0 200 220" className="size-full">
      {Array.from({ length: 21 }, (_, i) => (
        <motion.rect key={i} x={20 + i * 8} width="4" rx="2" fill={i % 7 === 3 ? 'var(--signal)' : 'currentColor'} fillOpacity={i % 7 === 3 ? 1 : 0.35} animate={{ height: [10, 30 + ((i * 37) % 60), 10], y: [105, 90 - ((i * 37) % 60) / 2, 105] }} transition={{ ...loop, duration: 0.9 + (i % 5) * 0.15 }} />
      ))}
      <text x="100" y="180" textAnchor="middle" className="mono" fontSize="22" fill="currentColor" letterSpacing="8">
        3 7 2
      </text>
    </svg>
  );
}

function SymptomsViz() {
  return (
    <svg viewBox="0 0 200 220" className="size-full">
      {[0, 1, 2].map((i) => (
        <motion.circle key={i} cx="100" cy="90" r="30" fill="none" stroke="var(--signal)" animate={{ r: [30, 70], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.8, ease: 'easeOut' }} />
      ))}
      <circle cx="100" cy="90" r="30" fill="currentColor" />
      <rect x="93" y="74" width="14" height="24" rx="7" fill="var(--bg)" />
      {['बुखार · 3 दिन', 'खाँसी'].map((c, i) => (
        <motion.g key={c} animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, 0] }} transition={{ ...loop, duration: 3, delay: 0.6 + i * 0.4, times: [0, 0.2, 0.85, 1] }}>
          <rect x={i ? 112 : 30} y="168" width={i ? 58 : 76} height="26" rx="13" fill="currentColor" fillOpacity=".1" />
          <text x={i ? 141 : 68} y="185" textAnchor="middle" fontSize="11" fill="currentColor">
            {c}
          </text>
        </motion.g>
      ))}
    </svg>
  );
}

export function StepVisual({ step, className = '' }: { step: StepKey; className?: string }) {
  const V = { face: FaceViz, eye: EyeViz, vision: VisionViz, hearing: HearingViz, symptoms: SymptomsViz }[step];
  return (
    <div className={className}>
      <V />
    </div>
  );
}
