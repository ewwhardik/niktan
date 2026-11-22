import { useEffect, useRef } from 'react';

export type RingState = 'searching' | 'locked' | 'issue';

/** Breathing + echo ring around the camera oval; syncs its period to the measured heart rate. */
export function ScanRing({ state, bpm, className = '' }: { state: RingState; bpm?: number | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !el.getAnimations) return;
    const base = 2.4;
    const rate = bpm && state === 'locked' ? base / (60 / Math.min(Math.max(bpm, 45), 160)) : 1;
    for (const a of el.getAnimations({ subtree: true })) a.updatePlaybackRate(rate);
  }, [bpm, state]);
  return (
    <div ref={ref} data-state={state} className={`scan-ring pointer-events-none absolute ${className}`} aria-hidden>
      <span className="ring ring--breathe" />
      <span className="ring ring--echo" />
      <span className="ring ring--echo ring--echo-2" />
    </div>
  );
}
