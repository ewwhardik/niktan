import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowUp, CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type P = 'emergency' | 'today' | 'routine';
interface Tile {
  id: number;
  n: number;
  p: P;
  age: number;
}
const RANK: Record<P, number> = { emergency: 0, today: 1, routine: 2 };
const META: Record<P, { icon: typeof CircleCheck; color: string }> = {
  emergency: { icon: OctagonAlert, color: 'var(--emergency)' },
  today: { icon: TriangleAlert, color: 'var(--seetoday)' },
  routine: { icon: CircleCheck, color: 'var(--routine)' },
};
const SEED: Tile[] = [
  { id: 1, n: 11, p: 'today', age: 46 },
  { id: 2, n: 9, p: 'routine', age: 31 },
  { id: 3, n: 10, p: 'routine', age: 62 },
  { id: 4, n: 12, p: 'routine', age: 24 },
];
const sort = (list: Tile[]) => [...list].sort((a, b) => RANK[a.p] - RANK[b.p] || a.n - b.n);

/** Demo loop: a red patient arrives last and the board lifts them to the top. */
export function MiniBoard({ className = '' }: { className?: string }) {
  const [tiles, setTiles] = useState<Tile[]>(sort(SEED));
  // The arrival that just jumped ahead of others, marked for a moment.
  const [jumped, setJumped] = useState<number | null>(null);
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { margin: '-10% 0px' });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView || reduce) return;
    let n = 13;
    let id = 10;
    // A fixed rhythm so the story reads: routine, see-today, emergency, routine, ...
    const pattern: P[] = ['routine', 'today', 'emergency', 'routine', 'emergency', 'today'];
    let k = 0;
    const timers: number[] = [];
    const tick = setInterval(() => {
      setTiles((cur) => {
        // Arrive at the bottom first, then sort a beat later so the jump is visible.
        const arrival: Tile = { id: id++, n: n++, p: pattern[k++ % pattern.length]!, age: 20 + ((n * 37) % 60) };
        timers.push(window.setTimeout(() => setTiles((c) => {
          const next = sort(c);
          if (next.findIndex((t) => t.id === arrival.id) < c.length - 1) {
            setJumped(arrival.id);
            timers.push(window.setTimeout(() => setJumped((j) => (j === arrival.id ? null : j)), 1700));
          }
          return next;
        }), 900));
        // Keep five tiles by letting the lowest-priority, latest arrival leave first.
        const kept = cur.length >= 5 ? sort(cur).slice(0, -1) : cur;
        return [...sort(kept), arrival];
      });
    }, 2800);
    return () => { clearInterval(tick); timers.forEach(clearTimeout); };
  }, [inView, reduce]);
  return (
    <ul ref={ref} className={`flex flex-col gap-2 ${className}`}>
      <AnimatePresence initial={false}>
        {tiles.map((t) => {
          const M = META[t.p];
          return (
            <motion.li key={t.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
              <span className="h-8 w-1 rounded-full" style={{ background: M.color }} />
              <span className="tnum text-body-lg font-semibold text-white">#{t.n}</span>
              <span className="text-caption text-white/55">{t.age} yrs</span>
              <AnimatePresence>
                {jumped === t.id && (
                  <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="ml-auto grid size-6 place-items-center rounded-full bg-white text-black">
                    <ArrowUp size={13} strokeWidth={2.5} aria-hidden />
                  </motion.span>
                )}
              </AnimatePresence>
              <M.icon size={18} className={jumped === t.id ? '' : 'ml-auto'} style={{ color: M.color }} aria-hidden />
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
