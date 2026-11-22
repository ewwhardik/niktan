import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { ease } from './motion';

/** Counts up to `value` once it appears; shows the final number immediately with reduced motion. */
export function CountUp({ value, decimals = 0, className = '', duration = 1.1 }: { value: number; decimals?: number; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => v.toFixed(decimals));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease });
    return () => controls.stop();
  }, [value, reduce, mv, duration]);
  return <motion.span className={`tnum ${className}`}>{text}</motion.span>;
}

/** Circular progress ring driven by a 0..1 value. Animates stroke-dashoffset on the compositor-friendly SVG path. */
export function ProgressRing({ progress, size = 280, stroke = 4, className = '' }: { progress: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="white"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, progress))) }}
        transition={{ duration: 0.3, ease: 'linear' }}
        style={{ rotate: -90, transformOrigin: '50% 50%' }}
      />
    </svg>
  );
}
