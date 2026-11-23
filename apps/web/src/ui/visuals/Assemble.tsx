import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Bug, Cat, Ear, Eye, FileText, Glasses, HeartPulse, Mic, MessageCircle, Minimize2, Shield, Sparkles, Soup, Timer, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TiltCard } from '../fx';
import { ease } from '../motion';
import { GLYPHS, WebCorner } from './HeroGlyphs';

interface Hero {
  name: string;
  power: string;
  feature: string;
  line: string;
  to: string;
}

/** Generic icons and colour accents only: no character artwork or logos. */
const LOOK: Record<string, { icon: LucideIcon; feature: LucideIcon; accent: string }> = {
  'Iron Man': { icon: Sparkles, feature: HeartPulse, accent: '#c8102e' },
  Vision: { icon: Eye, feature: Glasses, accent: '#2e8b57' },
  Hawkeye: { icon: Eye, feature: Eye, accent: '#6b3fa0' },
  Thor: { icon: Sparkles, feature: Ear, accent: '#1f5fbf' },
  'Black Widow': { icon: Sparkles, feature: Mic, accent: '#111111' },
  'Captain America': { icon: Shield, feature: Shield, accent: '#1d4ed8' },
  'Doctor Strange': { icon: Eye, feature: FileText, accent: '#b45309' },
  Hulk: { icon: Sparkles, feature: Soup, accent: '#15803d' },
  'Spider-Man': { icon: Bug, feature: MessageCircle, accent: '#dc2626' },
  'Black Panther': { icon: Cat, feature: Shield, accent: '#4c1d95' },
  'Ant-Man': { icon: Minimize2, feature: Minimize2, accent: '#b91c1c' },
  'Captain Marvel': { icon: Sparkles, feature: Timer, accent: '#d97706' },
};


/** The hackathon's Avengers theme: Doom is the queue, each hero is a NikTan feature. */
export function Assemble() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const a = t('home.assemble', { returnObjects: true }) as {
    eyebrow: string; title: string; body: string; doomName: string; doomRole: string; doomTitle: string; doomBody: string; doomStat: string; heroes: Hero[]; note: string;
  };
  const go = (to: string) => (to.startsWith('#') ? document.querySelector(to)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }) : navigate(to));

  return (
    <section id="assemble" className="relative mx-auto max-w-[1240px] scroll-mt-24 px-5 pt-24 md:px-10 md:pt-32">
      {/* Decoration only: a web in the corner with a spider bobbing on its thread. */}
      <WebCorner className="pointer-events-none absolute top-6 right-0 hidden h-40 w-32 text-text-3 opacity-50 select-none md:block lg:h-52 lg:w-40" />
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-12% 0px' }} transition={{ duration: 0.8, ease }} className="mx-auto max-w-3xl text-center">
        <p className="eyebrow">{a.eyebrow}</p>
        <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{a.title}</h2>
        <p className="mx-auto mt-6 max-w-2xl text-body-lg text-text-2">{a.body}</p>
      </motion.div>

      {/* The villain: Doom's green and steel, with the wait the whole page is about. */}
      <motion.div initial={{ opacity: 0, y: 28, scale: 0.98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: 0.9, ease }}
        className="relative mt-12 overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#0f2a1e,#13201b_45%,#1d2326)] p-7 text-[#eef3ee] md:mt-16 md:p-10">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full border-[18px] border-[#3f5f4e]/40" />
        <div aria-hidden className="pointer-events-none absolute -top-10 -right-2 size-48 rounded-full border-[10px] border-[#8fa89a]/20" />
        <div className="relative grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-10">
          <span className="grid size-20 place-items-center rounded-[24px] bg-[#2b4a3a] ring-1 ring-[#8fa89a]/40 md:size-24">
            {GLYPHS['Doctor Doom']!({ className: 'size-11' })}
          </span>
          <div>
            <p className="text-caption tracking-[0.14em] text-[#9fb8aa] uppercase">{a.doomRole} · {a.doomName}</p>
            <h3 className="mt-2 text-[clamp(1.75rem,3.2vw,2.5rem)] leading-tight font-semibold">{a.doomTitle}</h3>
            <p className="mt-3 max-w-2xl text-body-lg text-[#c9d6ce]">{a.doomBody}</p>
          </div>
          <p className="tnum rounded-2xl bg-black/25 px-5 py-4 text-center text-title-3 font-semibold ring-1 ring-white/10">{a.doomStat}</p>
        </div>
      </motion.div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {a.heroes.map((h, i) => {
          const look = LOOK[h.name] ?? { icon: Sparkles, feature: Sparkles, accent: '#555' };
          return (
            <motion.li key={h.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-6% 0px' }} transition={{ duration: 0.6, ease, delay: (i % 4) * 0.06 }}>
              <TiltCard className="h-full rounded-[24px]">
                <button type="button" onClick={() => go(h.to)} className="lp-card group flex h-full w-full flex-col rounded-[24px] p-5 text-left">
                  <span className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full text-white transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110" style={{ background: look.accent }}>
                      {(GLYPHS[h.name] ?? GLYPHS['Captain Marvel']!)({ className: 'size-6' })}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-title-3 font-semibold">{h.name}</span>
                      <span className="block truncate text-caption text-text-3">{h.power}</span>
                    </span>
                  </span>
                  <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-sunken px-2.5 py-1 text-caption font-medium">
                    <look.feature size={13} aria-hidden /> {h.feature}
                  </span>
                  <span className="mt-3 flex-1 text-body text-text-2">{h.line}</span>
                  <ArrowUpRight size={16} className="mt-3 self-end text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </button>
              </TiltCard>
            </motion.li>
          );
        })}
      </ul>
      <p className="mt-4 text-caption text-text-3">{a.note}</p>
    </section>
  );
}
