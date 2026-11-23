import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  useEffect(() => {
    let n = 13;
    let id = 10;
    const tick = setInterval(() => {
      setTiles((cur) => {
        // Arrive at the bottom first, then sort a beat later so the jump is visible.
        const arrival: Tile = { id: id++, n: n++, p: Math.random() < 0.3 ? 'emergency' : Math.random() < 0.5 ? 'today' : 'routine', age: 20 + Math.floor(Math.random() * 60) };
        setTimeout(() => setTiles((c) => sort(c)), 900);
        // Keep five tiles by letting the lowest-priority, latest arrival leave first.
        const kept = cur.length >= 5 ? sort(cur).slice(0, -1) : cur;
        return [...sort(kept), arrival];
      });
    }, 2800);
    return () => clearInterval(tick);
  }, []);
  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      <AnimatePresence initial={false}>
        {tiles.map((t) => {
          const M = META[t.p];
          return (
            <motion.li key={t.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
              <span className="h-8 w-1 rounded-full" style={{ background: M.color }} />
              <span className="tnum text-body-lg font-semibold text-white">#{t.n}</span>
              <span className="text-caption text-white/55">{t.age} yrs</span>
              <M.icon size={18} className="ml-auto" style={{ color: M.color }} aria-hidden />
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
