import { motion } from 'motion/react';
import { Check, Ear, Eye, Glasses, HeartPulse, Mic, type LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { springs } from './motion';

const ICONS: Record<string, LucideIcon> = { face: HeartPulse, eye: Eye, vision: Glasses, hearing: Ear, symptoms: Mic };

/** Step rail: icons joined by a line that fills as you progress. Labels show on wide screens. */
export function StepRail({ steps, index, labels }: { steps: readonly string[]; index: number; labels: string[] }) {
  return (
    <ol className="flex min-w-0 flex-1 items-center" aria-label={labels[index]}>
      {steps.map((s, i) => {
        const Icon = i < index ? Check : ICONS[s] ?? HeartPulse;
        const state = i < index ? 'done' : i === index ? 'active' : 'todo';
        return (
          <li key={s} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`} aria-current={state === 'active' ? 'step' : undefined}>
            <span className="relative flex items-center gap-2">
              <motion.span
                className={`relative flex size-8 shrink-0 items-center justify-center rounded-full border ${state === 'active' ? 'border-transparent bg-accent text-on-accent' : state === 'done' ? 'border-transparent bg-sunken text-text' : 'border-border text-text-3'}`}
                animate={{ scale: state === 'active' ? 1 : 0.9 }}
                transition={springs.chip}
              >
                {state === 'active' && <motion.span layoutId="rail-halo" className="absolute -inset-1 rounded-full ring-1 ring-[var(--signal)]" transition={springs.shared} />}
                <Icon size={15} strokeWidth={1.9} aria-hidden />
              </motion.span>
              <span className={`hidden whitespace-nowrap text-label xl:inline ${state === 'active' ? 'font-semibold text-text' : 'text-text-3'}`}>{labels[i]}</span>
            </span>
            {i < steps.length - 1 && (
              <span className="mx-2 h-px flex-1 overflow-hidden bg-border">
                <motion.span className="block h-full origin-left bg-text" initial={false} animate={{ scaleX: i < index ? 1 : 0 }} transition={springs.progress} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Two columns on laptops (stage | controls), stacked on phones. */
export function StepLayout({ stage, children }: { stage: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-5 pt-3 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16 lg:pt-6">
      <div className="lg:flex lg:justify-center">{stage}</div>
      <div className="flex flex-1 flex-col lg:min-h-[min(72vh,680px)] lg:justify-center">{children}</div>
    </div>
  );
}

/** Camera frame with optical corner ticks. On a mouse it leans a few degrees toward the pointer. */
export function StageFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `perspective(1400px) rotateX(${((r.top + r.height / 2 - e.clientY) / r.height) * 4}deg) rotateY(${((e.clientX - r.left - r.width / 2) / r.width) * 4}deg)`;
  };
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={() => { if (ref.current) ref.current.style.transform = ''; }}
      className={`stage-3d relative mx-auto aspect-[3/4] w-full max-w-[400px] overflow-hidden rounded-[32px] bg-black ring-1 ring-white/10 lg:h-[min(72vh,680px)] lg:w-auto lg:max-w-none ${className}`} style={{ touchAction: 'pan-y' }}>
      {children}
      {(['top-3 left-3 border-t border-l', 'top-3 right-3 border-t border-r', 'bottom-3 left-3 border-b border-l', 'bottom-3 right-3 border-b border-r'] as const).map((c) => (
        <span key={c} className={`pointer-events-none absolute size-5 rounded-[6px] border-white/40 ${c}`} />
      ))}
    </div>
  );
}

/** Small instrument read-out, monospace. */
export function Hud({ label, value, tone = 'muted' }: { label: string; value: ReactNode; tone?: 'muted' | 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-[var(--signal-2)]' : tone === 'warn' ? 'text-seetoday-text' : 'text-white/80';
  return (
    <div className="rounded-xl bg-black/45 px-2.5 py-1.5 backdrop-blur-md">
      <p className="mono text-[9px] tracking-[0.16em] text-white/45 uppercase">{label}</p>
      <p className={`mono text-[12px] leading-tight ${color}`}>{value}</p>
    </div>
  );
}

/** Large step heading for the controls column. */
export function StepTitle({ eyebrow, title, body }: { eyebrow: string; title: ReactNode; body?: ReactNode }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-2 text-title-1 font-semibold lg:text-[2.75rem] lg:leading-[1.05]">{title}</h1>
      {body && <div className="mt-3 text-body-lg text-text-2">{body}</div>}
    </div>
  );
}
