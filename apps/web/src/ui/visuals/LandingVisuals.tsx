import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { Activity, BadgeCheck, Bell, Cpu, Ear, Eye, Glasses, HeartPulse, Lock, Mic, Search, ShieldCheck, Smartphone, Siren, WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BeatingHeart } from '../BeatingHeart';
import { CountUp } from '../Numbers';
import { ease } from '../motion';

/** A repeating PPG strip: `beats` cardiac cycles per half so a -50% translate loops seamlessly. */
function ppgPath(beats: number, beatW: number, h: number) {
  const base = h * 0.78;
  let d = `M0 ${base}`;
  for (let i = 0; i < beats * 2; i++) {
    const x = i * beatW;
    d += ` L${x + beatW * 0.12} ${base} C${x + beatW * 0.2} ${base} ${x + beatW * 0.24} ${h * 0.12} ${x + beatW * 0.34} ${h * 0.14}`;
    d += ` S${x + beatW * 0.46} ${h * 0.52} ${x + beatW * 0.52} ${h * 0.5} S${x + beatW * 0.62} ${h * 0.42} ${x + beatW * 0.7} ${h * 0.6} S${x + beatW * 0.85} ${base} ${x + beatW} ${base}`;
  }
  return d;
}

/** Hero product shot: the pre-consult card a doctor opens, rising flat as the page scrolls. */
export function HeroConsole({ progress }: { progress: MotionValue<number> }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const tilt = useTransform(progress, [0, 0.45], reduce ? [0, 0] : [20, 0]);
  const lift = useTransform(progress, [0, 0.45], reduce ? [0, 0] : [48, 0]);
  const scale = useTransform(progress, [0, 0.45], reduce ? [1, 1] : [0.94, 1]);
  const c = t('home.console', { returnObjects: true }) as {
    brand: string; tabs: string[]; hello: string; meta: string[]; hr: string; vision: string; hearing: string; summary: string; rows: string[];
    chart: string; tip: string; verdict: string; ahead: string; moved: string; open: string;
  };
  const rowIcons: LucideIcon[] = [HeartPulse, Eye, Glasses, Ear, Mic];
  const beats = 8;
  return (
    <div className="relative mx-auto w-full max-w-[1080px] [perspective:1600px]">
      <motion.div style={{ rotateX: tilt, y: lift, scale, transformOrigin: '50% 0%' }} className="lp-card relative overflow-hidden rounded-[28px] p-3 ring-1 ring-[var(--lp-line)] sm:p-4" aria-label={t('home.example')} role="img">
        {/* Top bar */}
        <div className="flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2.5 sm:px-4">
          <img src="/brand/niktan-mark.svg" alt="" width="22" height="22" className="size-5 dark:brightness-0 dark:invert" />
          <span className="text-label font-semibold">NikTan <span className="font-normal text-text-3">· {c.brand}</span></span>
          <div className="mx-auto hidden items-center gap-1 rounded-full bg-bg p-1 md:flex">
            {c.tabs.map((tab, i) => (
              <span key={tab} className={`rounded-full px-3 py-1 text-caption ${i === 0 ? 'bg-[var(--lp-card)] font-medium text-text shadow-1' : 'text-text-3'}`}>{tab}</span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-text-2 md:ml-0">
            <span className="grid size-8 place-items-center rounded-full bg-bg"><Search size={14} aria-hidden /></span>
            <span className="relative grid size-8 place-items-center rounded-full bg-bg"><Bell size={14} aria-hidden /><span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[var(--lp-heart)]" /></span>
          </div>
        </div>

        {/* Greeting + counters */}
        <div className="mt-5 grid gap-4 px-1 sm:px-2 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-[clamp(1.25rem,2.4vw,1.75rem)] font-semibold tracking-tight">{c.hello}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.meta.map((m) => <span key={m} className="rounded-full bg-sunken px-2.5 py-1 text-caption text-text-2">{m}</span>)}
            </div>
          </div>
          <div className="flex gap-6 sm:gap-8">
            {[
              { v: 72, u: 'bpm', l: c.hr, icon: <BeatingHeart bpm={72} className="size-3.5" /> },
              { v: 6, u: '/9', l: c.vision, icon: <Glasses size={14} aria-hidden /> },
              { v: 4, u: '/4', l: c.hearing, icon: <Ear size={14} aria-hidden /> },
            ].map((s) => (
              <div key={s.l}>
                <p className="flex items-baseline gap-1">
                  <CountUp value={s.v} className="text-[clamp(1.75rem,3.4vw,2.6rem)] leading-none font-semibold tracking-tight" />
                  <span className="text-caption text-text-3">{s.u}</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-caption text-text-3">{s.icon}{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Panels */}
        <div className="mt-5 grid gap-3 md:grid-cols-[0.9fr_1.6fr_0.9fr]">
          <div className="hidden rounded-2xl bg-sunken p-4 md:block">
            <p className="text-label font-semibold">{c.summary}</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {c.rows.map((r, i) => {
                const Icon = rowIcons[i]!;
                return (
                  <motion.li key={r} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.07, ease, duration: 0.5 }} className="flex items-center gap-2.5 rounded-xl bg-[var(--lp-card)] px-2.5 py-2 text-caption text-text-2">
                    <Icon size={14} className="text-text-3" aria-hidden />
                    <span className="truncate">{r}</span>
                  </motion.li>
                );
              })}
            </ul>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-sunken p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-label font-semibold"><Activity size={15} className="text-[var(--lp-heart)]" aria-hidden />{c.chart}</p>
              <span className="flex items-center gap-1.5 text-caption text-text-3"><span className="size-1.5 rounded-full bg-[var(--lp-heart)]" />Live</span>
            </div>
            <div className="relative mt-3 h-36 overflow-hidden sm:h-44">
              {[0.25, 0.5, 0.75].map((y) => <div key={y} className="absolute inset-x-0 border-t border-[var(--lp-line)]" style={{ top: `${y * 100}%` }} />)}
              <svg className="lp-strip absolute inset-y-0 left-0 h-full" style={{ width: '200%', animationDuration: `${(beats * 60) / 72}s` }} viewBox={`0 0 ${beats * 2 * 80} 100`} preserveAspectRatio="none" aria-hidden>
                <path d={ppgPath(beats, 80, 100)} fill="none" stroke="var(--lp-heart)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="absolute top-2 left-[56%] rounded-lg bg-[var(--lp-card)] px-2.5 py-1.5 text-caption shadow-2">
                <span className="tnum text-[11px] text-text-3">00:21</span>
                <p className="font-semibold">{c.tip}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-2xl bg-seetoday-tint p-4 text-seetoday-ink">
            <span className="flex items-center gap-2 text-label font-semibold"><span className="size-2 rounded-full bg-seetoday" />{c.verdict}</span>
            <div>
              <p className="text-[2.25rem] leading-none font-semibold tracking-tight text-text">{c.ahead}</p>
              <p className="mt-1 text-caption">{c.moved}</p>
            </div>
            <span className="inline-flex h-9 items-center justify-center rounded-full bg-text text-caption font-semibold text-bg">{c.open}</span>
          </div>
        </div>
      </motion.div>

    </div>
  );
}

/** Queue tags on a quiet field, wired together; the breathless patient links to "Seen 1st". */
export function Constellation({ tags }: { tags: string[] }) {
  // Positions in a 600×340 design space.
  const nodes = [
    { x: 70, y: 70 }, { x: 330, y: 40 }, { x: 500, y: 120 }, { x: 140, y: 230 }, { x: 420, y: 280 }, { x: 300, y: 170 },
  ];
  const links: [number, number, boolean?][] = [[0, 1], [1, 2], [0, 5], [5, 4], [2, 4], [3, 5, true]];
  return (
    <div className="relative aspect-[600/340] w-full">
      <svg viewBox="0 0 600 340" className="absolute inset-0 size-full" aria-hidden>
        {links.map(([a, b, hot], i) => {
          const A = nodes[a]!;
          const B = nodes[b]!;
          return (
            <g key={i}>
              <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--lp-line)" strokeWidth="1" />
              {hot && <line className="lp-flow" x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--lp-accent)" strokeWidth="2" strokeLinecap="round" style={{ ['--dur' as string]: '1.8s' }} />}
            </g>
          );
        })}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r="3" fill={i === 3 ? 'var(--emergency)' : i === 5 ? 'var(--lp-accent)' : 'var(--text-3)'} />
        ))}
      </svg>
      {nodes.map((n, i) => (
        <span key={i} className={`lp-float absolute -translate-x-1/2 translate-y-3 rounded-lg px-2.5 py-1.5 text-[clamp(0.65rem,1.3vw,0.8rem)] font-medium whitespace-nowrap ${i === 3 ? 'bg-emergency-tint text-emergency-ink' : i === 5 ? 'bg-[var(--lp-accent)] text-white' : 'bg-bg text-text-2'}`}
          style={{ left: `${(n.x / 600) * 100}%`, top: `${(n.y / 340) * 100}%`, ['--dur' as string]: `${6 + (i % 3) * 1.4}s`, ['--delay' as string]: `${-i * 0.9}s` }}>
          {tags[i]}
        </span>
      ))}
    </div>
  );
}

const HUB_ICONS: LucideIcon[] = [HeartPulse, Eye, Glasses, Ear, Mic];
const OUT_DOT = ['var(--emergency)', 'var(--seetoday)', 'var(--routine)'];

/** Circuit trace: right from (x0,y0), a rounded turn into a vertical run at `vx`, then right to x1 at y1. */
function trace(x0: number, y0: number, vx: number, y1: number, x1: number) {
  const dir = Math.sign(y1 - y0);
  if (!dir) return `M${x0} ${y0} H${x1}`;
  const r = Math.min(16, Math.abs(y1 - y0) / 2);
  return `M${x0} ${y0} H${vx - r} Q${vx} ${y0} ${vx} ${y0 + dir * r} V${y1 - dir * r} Q${vx} ${y1} ${vx + r} ${y1} H${x1}`;
}

/** Five check modules wired into the triage engine, which fans out to the three verdicts. */
export function TriageHub({ modules, short, engine, outs }: { modules: string[]; short: string[]; engine: string; outs: string[] }) {
  // Design space 1000×560. Modules on the left, engine centre-right, verdicts on the far right.
  const my = [60, 170, 280, 390, 500];
  const oy = [150, 280, 410];
  const chip = { x: 610, y: 280 };
  return (
    <>
      <div className="relative hidden aspect-[1000/560] w-full lg:block">
        <svg viewBox="0 0 1000 560" className="absolute inset-0 size-full" aria-hidden>
          {my.map((y, i) => {
            const d = trace(300, y, 380 + i * 18, chip.y + (i - 2) * 22, chip.x - 80);
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="var(--lp-line)" strokeWidth="1.5" />
                <path className="lp-flow" d={d} fill="none" stroke="var(--lp-accent)" strokeWidth="2" strokeLinecap="round" style={{ ['--dur' as string]: '2.6s', ['--delay' as string]: `${-i * 0.5}s` }} />
              </g>
            );
          })}
          {oy.map((y, i) => {
            const d = trace(chip.x + 80, chip.y + (i - 1) * 26, 760 - Math.abs(i - 1) * 18, y, 810);
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="var(--lp-line)" strokeWidth="1.5" />
                <path className="lp-flow" d={d} fill="none" stroke={OUT_DOT[i]} strokeWidth="2" strokeLinecap="round" style={{ ['--dur' as string]: '2.2s', ['--delay' as string]: `${-i * 0.6 - 1}s` }} />
              </g>
            );
          })}
          {/* Package pins */}
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i} stroke="var(--text-3)" strokeOpacity="0.5" strokeWidth="1.5">
              <line x1={chip.x - 48 + i * 16} y1={chip.y - 80} x2={chip.x - 48 + i * 16} y2={chip.y - 96} />
              <line x1={chip.x - 48 + i * 16} y1={chip.y + 80} x2={chip.x - 48 + i * 16} y2={chip.y + 96} />
            </g>
          ))}
        </svg>
        {modules.map((m, i) => {
          const Icon = HUB_ICONS[i]!;
          return (
            <motion.div key={m} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07, duration: 0.6, ease }}
              className="lp-card absolute left-0 flex w-[30%] -translate-y-1/2 items-center gap-3 rounded-2xl px-4 py-3" style={{ top: `${(my[i]! / 560) * 100}%` }}>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunken"><Icon size={18} aria-hidden /></span>
              <span className="min-w-0">
                <span className="block truncate text-label font-semibold">{m}</span>
                <span className="block truncate text-caption text-text-3">{short[i]}</span>
              </span>
            </motion.div>
          );
        })}
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(chip.x / 1000) * 100}%`, top: '50%', width: '16%', aspectRatio: '1' }}>
          <motion.div initial={{ scale: 0.92, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, ease, delay: 0.25 }}
            className="lp-tile grid size-full place-items-center rounded-[22%] bg-[linear-gradient(160deg,#3a3a3c,#1d1d1f)] ring-1 ring-black/40">
            <div className="text-center">
              <Cpu size={28} strokeWidth={1.5} className="mx-auto opacity-80" aria-hidden />
              <p className="mt-1.5 px-2 text-label leading-tight font-semibold">{engine}</p>
            </div>
          </motion.div>
        </div>
        {outs.map((o, i) => (
          <motion.div key={o} initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.45 + i * 0.08, duration: 0.6, ease }}
            className="lp-card absolute right-0 flex w-[19%] -translate-y-1/2 items-center gap-2.5 rounded-2xl px-4 py-3 text-label font-semibold" style={{ top: `${(oy[i]! / 560) * 100}%` }}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: OUT_DOT[i] }} />
            {o}
          </motion.div>
        ))}
      </div>

      {/* Phones and tablets: the same flow, stacked. */}
      <div className="flex flex-col items-center gap-3 lg:hidden">
        <div className="grid w-full gap-2.5 sm:grid-cols-2">
          {modules.map((m, i) => {
            const Icon = HUB_ICONS[i]!;
            return (
              <div key={m} className="lp-card flex items-center gap-3 rounded-2xl px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken"><Icon size={17} aria-hidden /></span>
                <span className="min-w-0"><span className="block text-label font-semibold">{m}</span><span className="block text-caption text-text-3">{short[i]}</span></span>
              </div>
            );
          })}
        </div>
        <svg viewBox="0 0 10 48" className="h-10 w-3" aria-hidden><line x1="5" y1="0" x2="5" y2="48" stroke="var(--lp-line)" strokeWidth="1.5" /><line className="lp-flow" x1="5" y1="0" x2="5" y2="48" stroke="var(--lp-accent)" strokeWidth="2" /></svg>
        <div className="lp-tile grid size-28 place-items-center rounded-[26px] bg-[linear-gradient(160deg,#3a3a3c,#1d1d1f)]">
          <div className="text-center"><Cpu size={24} className="mx-auto opacity-80" aria-hidden /><p className="mt-1 px-2 text-label leading-tight font-semibold">{engine}</p></div>
        </div>
        <svg viewBox="0 0 10 48" className="h-10 w-3" aria-hidden><line x1="5" y1="0" x2="5" y2="48" stroke="var(--lp-line)" strokeWidth="1.5" /><line className="lp-flow" x1="5" y1="0" x2="5" y2="48" stroke="var(--lp-accent)" strokeWidth="2" /></svg>
        <div className="grid w-full gap-2.5 sm:grid-cols-3">
          {outs.map((o, i) => (
            <div key={o} className="lp-card flex items-center gap-2.5 rounded-2xl px-4 py-3 text-label font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: OUT_DOT[i] }} />{o}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const NOTIF_ICON: { icon: LucideIcon; color: string }[] = [
  { icon: BadgeCheck, color: 'var(--seetoday)' },
  { icon: Siren, color: 'var(--emergency)' },
  { icon: Smartphone, color: 'var(--lp-accent)' },
  { icon: Activity, color: 'var(--text-3)' },
];

/** Queue events that slide in one after another, newest on top, three visible at a time. */
export function NotificationStack({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  const [head, setHead] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduce || !visible) return;
    const id = window.setInterval(() => setHead((h) => h + 1), 2600);
    return () => clearInterval(id);
  }, [reduce, visible]);
  const shown = [0, 1, 2].map((k) => head - k).filter((n) => n >= 0 || reduce).map((n) => ((n % items.length) + items.length) % items.length);
  return (
    <div ref={ref} className="relative flex h-[188px] flex-col gap-2.5 overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((idx, k) => {
          const S = NOTIF_ICON[idx % NOTIF_ICON.length]!;
          return (
            <motion.div key={`${head - k}`} layout initial={{ opacity: 0, y: -20, scale: 0.97 }} animate={{ opacity: 1 - k * 0.3, y: 0, scale: 1 - k * 0.025 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className="flex items-center gap-3 rounded-2xl bg-sunken px-3.5 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--lp-card)]" style={{ color: S.color }}><S.icon size={15} aria-hidden /></span>
              <span className="min-w-0 flex-1 truncate text-label">{items[idx]}</span>
              <span className="shrink-0 text-caption text-text-3">now</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

const FOUND_ICONS: LucideIcon[] = [Activity, ShieldCheck, Lock, WifiOff, Smartphone];
const FOUND_LAYOUT = [
  { x: '4%', y: '18%', r: -7 },
  { x: '23%', y: '0%', r: 5 },
  { x: '42%', y: '30%', r: -3 },
  { x: '61%', y: '2%', r: 6 },
  { x: '79%', y: '22%', r: -5 },
];

/** Five pillars tossed on the table that straighten into a neat row as you scroll in. */
export function FoundationCards({ items }: { items: { t: string; d: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  return (
    <div ref={ref} className="relative">
      <div className="relative hidden h-[420px] lg:block">
        {items.map((it, i) => (
          <FoundationCard key={it.t} item={it} i={i} progress={scrollYProgress} reduce={!!reduce} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {items.map((it, i) => {
          const Icon = FOUND_ICONS[i]!;
          return (
            <div key={it.t} className={`rounded-3xl p-5 ${i === 2 ? 'lp-tile' : 'lp-card'}`}>
              <Icon size={22} aria-hidden />
              <p className="mt-4 text-title-3 font-semibold">{it.t}</p>
              <p className={`mt-1 text-body ${i === 2 ? 'text-white/70' : 'text-text-2'}`}>{it.d}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FoundationCard({ item, i, progress, reduce }: { item: { t: string; d: string }; i: number; progress: MotionValue<number>; reduce: boolean }) {
  const L = FOUND_LAYOUT[i]!;
  const rotate = useTransform(progress, [0, 1], reduce ? [0, 0] : [L.r * 1.6, L.r * 0.3]);
  const y = useTransform(progress, [0, 1], reduce ? [0, 0] : [70 + i * 12, 0]);
  const Icon = FOUND_ICONS[i]!;
  const dark = i === 2;
  return (
    <motion.div style={{ left: L.x, top: L.y, rotate, y }} whileHover={{ rotate: 0, y: -8, zIndex: 10 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`absolute w-[17.5%] min-w-[200px] rounded-[28px] p-6 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_16px_40px_-20px_rgb(0_0_0/0.2)] ${dark ? 'lp-tile' : 'lp-card'}`}>
      <span className={`grid size-12 place-items-center rounded-2xl ${dark ? 'bg-white/10' : 'bg-sunken'}`}><Icon size={22} aria-hidden /></span>
      <p className="mt-10 text-title-2 font-semibold">{item.t}</p>
      <p className={`mt-2 text-body ${dark ? 'text-white/70' : 'text-text-2'}`}>{item.d}</p>
    </motion.div>
  );
}

/** Tiny animated glyphs that sit inside the headline pills. */
export function PillHeart() {
  return <BeatingHeart bpm={72} className="size-[0.42em]" />;
}

export function PillEye() {
  return (
    <svg viewBox="0 0 40 24" className="h-[0.38em] w-[0.82em] overflow-visible text-text" aria-hidden>
      <path d="M2 12C8 3 32 3 38 12C32 21 8 21 2 12Z" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="20" cy="12" r="5.5" fill="currentColor">
        <animate attributeName="cx" values="16;24;16" dur="3.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/** Where each dish sits on the 400×400 plate, and the label's side. */
const DISHES = [
  { cx: 128, cy: 118, r: 52, fill: '#e3b04b', side: 'left' },
  { cx: 214, cy: 236, r: 84, fill: '#f3eee2', side: 'right', rice: true },
  { cx: 288, cy: 112, r: 50, fill: '#8e2d3c', side: 'right' },
  { cx: 104, cy: 262, r: 58, fill: '#d6a466', side: 'left', roti: true },
  { cx: 300, cy: 318, r: 40, fill: '#fbfaf6', side: 'right' },
] as const;

/** A thali seen from above: a scan line passes and each dish gets its name tag. */
export function ThaliPlate({ dishes }: { dishes: string[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      <svg viewBox="0 0 400 400" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <radialGradient id="thali-steel" cx="40%" cy="35%" r="75%">
            <stop offset="0" stopColor="#f2f2f4" />
            <stop offset="0.7" stopColor="#c9c9ce" />
            <stop offset="1" stopColor="#a7a7ad" />
          </radialGradient>
          <clipPath id="thali-clip"><circle cx="200" cy="200" r="186" /></clipPath>
        </defs>
        <g>
          <circle cx="200" cy="200" r="190" fill="url(#thali-steel)" />
          <circle cx="200" cy="200" r="172" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2" />
          {DISHES.map((d, i) => (
            <g key={i}>
              {!('rice' in d) && !('roti' in d) && <circle cx={d.cx} cy={d.cy} r={d.r + 7} fill="#d4d4d8" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="2" />}
              {'roti' in d ? (
                <>
                  <circle cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} />
                  {[[-18, -12], [10, 8], [-6, 20], [20, -18]].map(([x, y], k) => <circle key={k} cx={d.cx + x!} cy={d.cy + y!} r="5" fill="#a8743c" opacity="0.55" />)}
                </>
              ) : 'rice' in d ? (
                <>
                  <ellipse cx={d.cx} cy={d.cy} rx={d.r} ry={d.r * 0.82} fill={d.fill} />
                  {Array.from({ length: 26 }, (_, k) => <ellipse key={k} cx={d.cx - 50 + ((k * 37) % 100)} cy={d.cy - 40 + ((k * 23) % 80)} rx="4" ry="1.6" fill="#e2dccd" transform={`rotate(${k * 41} ${d.cx - 50 + ((k * 37) % 100)} ${d.cy - 40 + ((k * 23) % 80)})`} />)}
                </>
              ) : (
                <circle cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} />
              )}
            </g>
          ))}
        </g>
        <g clipPath="url(#thali-clip)">
          <rect className="thali-scan" x="0" y="0" width="400" height="3" fill="var(--lp-accent)" opacity="0.8" style={{ transformBox: 'view-box' }} />
        </g>
      </svg>
      {DISHES.map((d, i) => (
        <motion.span key={i} initial={reduce ? false : { opacity: 0, scale: 0.6, y: 6 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.3 + i * 0.12 }}
          className="lp-card absolute flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold whitespace-nowrap"
          style={{ left: `${(d.cx / 400) * 100}%`, top: `${((d.cy - d.r * 0.2) / 400) * 100}%`, translate: d.side === 'left' ? '-85% -50%' : '-15% -50%' }}>
          <span className="size-1.5 rounded-full bg-[var(--lp-accent)]" />{dishes[i]}
        </motion.span>
      ))}
    </div>
  );
}
