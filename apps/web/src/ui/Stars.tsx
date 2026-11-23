import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { haptic } from '../lib/perf';
import { spring } from './motion';

/** Five tappable stars; tapping the current value again clears it. */
export function Stars({ value, onChange, size = 30, label }: { value: number | null; onChange?: (v: number | null) => void; size?: number; label: string }) {
  return (
    <span role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? label : `${label}: ${value ?? 0}/5`} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = (value ?? 0) >= n;
        const star = <Star size={size} strokeWidth={1.6} className={on ? 'fill-[var(--seetoday)] text-[var(--seetoday)]' : 'text-border-strong'} aria-hidden />;
        return onChange ? (
          <motion.button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}`} whileTap={{ scale: 0.8 }} transition={spring.chip}
            onClick={() => { onChange(value === n ? null : n); haptic(8); }} className="flex min-h-11 min-w-10 items-center justify-center">
            {star}
          </motion.button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}
