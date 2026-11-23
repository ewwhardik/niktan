import { useId } from 'react';

/**
 * A heart that beats "lub-dub" at `bpm`, on CSS keyframes so it stays smooth
 * while the camera loop is busy on the main thread.
 */
export function BeatingHeart({ bpm, className = '' }: { bpm: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <span className={`beating-heart relative inline-grid place-items-center ${className}`} style={{ ['--beat' as string]: `${60 / bpm}s` }} aria-hidden>
      <svg viewBox="0 0 24 24" className="beating-heart__shape relative size-full">
        <defs>
          <linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff5a4f" />
            <stop offset="1" stopColor="#ff3b30" />
          </linearGradient>
        </defs>
        <path fill={`url(#h${id})`} d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.9 1.2 5.4 3.1 1.5-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21Z" />
        <path d="M7.4 7.6c-1.2.3-2 1.3-2.1 2.5" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Three PPG beats (systolic peak, dicrotic notch) that draw on, then sweep, once per beat. */
export function PpgTrace({ bpm, className = '', color = '#FF453A' }: { bpm: number; className?: string; color?: string }) {
  const id = useId().replace(/:/g, '');
  const beat = (x: number) => `L${x} 24 C${x + 4} 24 ${x + 6} 4 ${x + 11} 5 S${x + 17} 17 ${x + 20} 16 S${x + 25} 14 ${x + 28} 20 S${x + 34} 24 ${x + 40} 24`;
  const d = `M0 24 ${beat(0)} ${beat(40)} ${beat(80)} L160 24`;
  return (
    <svg viewBox="0 0 160 30" className={`ppg-trace ${className}`} style={{ ['--beat' as string]: `${60 / bpm}s` }} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`p${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset=".5" stopColor={color} stopOpacity=".9" />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="rgb(255 255 255 / .1)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path className="ppg-trace__ink" d={d} pathLength={100} fill="none" stroke={`url(#p${id})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
