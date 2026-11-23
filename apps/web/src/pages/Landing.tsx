import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, ArrowUpRight, Cpu, HeartPulse, Languages, Lock, Siren, Soup, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useScan } from '../state/scan';
import { LangToggle } from '../ui/Layout';
import { CountUp } from '../ui/Numbers';
import { Marquee } from '../ui/visuals/Marquee';
import { MiniBoard } from '../ui/visuals/MiniBoard';
import { PulseSphere } from '../ui/visuals/PulseSphere';
import { StepVisual, type StepKey } from '../ui/visuals/StepVisual';
import { DataFlow, QueueRace, TimeDonut } from '../ui/visuals/Infographics';
import { ease } from '../ui/motion';

interface Step {
  k: StepKey;
  t: string;
  d: string;
}

export function Glyph({ className = 'size-7' }: { className?: string }) {
  return <img src="/brand/niktan-mark.svg" width="28" height="28" alt="" className={`${className} object-contain dark:brightness-0 dark:invert`} />;
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-12% 0px' }} transition={{ duration: 0.8, ease, delay }}>
      {children}
    </motion.div>
  );
}

/** Headline that rises word by word, masked like a type specimen. */
function SplitHeading({ parts, className = '' }: { parts: { text: string; em?: boolean }[]; className?: string }) {
  let i = 0;
  return (
    <h1 className={className}>
      {parts.map((p, pi) =>
        p.text.split(' ').filter(Boolean).map((w, wi) => {
          const d = 0.08 + i++ * 0.07;
          return (
            <span key={`${pi}-${wi}`} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
              <motion.span className={`inline-block ${p.em ? 'serif italic' : ''}`} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: d }}>
                {w}&nbsp;
              </motion.span>
            </span>
          );
        }),
      )}
    </h1>
  );
}

function Nav({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 12));
  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-[background,border-color] duration-300 ${scrolled ? 'glass border-b border-border/70' : 'border-b border-transparent'}`}>
      <nav className="mx-auto flex min-h-16 max-w-[1240px] items-center gap-6 px-5 pt-[env(safe-area-inset-top)] md:px-10">
        <a href="#top" className="flex items-center gap-2.5">
          <Glyph />
          <span className="text-title-3 font-semibold tracking-tight">NikTan</span>
          <span className="serif hidden text-title-3 text-text-3 sm:inline">निकतन</span>
        </a>
        <div className="ml-auto hidden items-center gap-7 text-body text-text-2 lg:flex">
          <a href="#how" className="hover:text-text">{t('home.nav.how')}</a>
          <a href="#privacy" className="hover:text-text">{t('home.nav.privacy')}</a>
          <a href="#hospitals" className="hover:text-text">{t('home.nav.hospitals')}</a>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <LangToggle />
          <motion.button whileTap={{ scale: 0.96 }} onClick={onStart} className="hidden h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-body font-semibold text-on-accent sm:inline-flex">
            {t('home.nav.start')}
          </motion.button>
        </div>
      </nav>
    </header>
  );
}

function HowItWorks({ steps }: { steps: Step[] }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => setActive(Math.min(steps.length - 1, Math.floor(v * steps.length))));
  const bar = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="how" className="relative">
      <div className="mx-auto max-w-[1240px] px-5 pt-28 md:px-10 md:pt-40">
        <Reveal>
          <p className="eyebrow">{t('home.howEyebrow')}</p>
          <h2 className="mt-4 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{t('home.howTitle')}</h2>
        </Reveal>
      </div>

      {/* Desktop: pinned device on the left, steps scroll on the right. */}
      <div ref={ref} className="relative mx-auto hidden max-w-[1240px] px-10 lg:block" style={{ height: `${steps.length * 85}vh` }}>
        <div className="sticky top-0 grid h-dvh grid-cols-2 items-center gap-16">
          <div className="relative mx-auto aspect-[9/16] h-[72vh] max-h-[680px] rounded-[48px] bg-[#0b0b0c] p-3 shadow-4 ring-1 ring-black/5">
            <div className="chamber relative size-full overflow-hidden rounded-[38px] text-white">
              <div className="absolute inset-x-0 top-3 mx-auto h-6 w-24 rounded-full bg-black" />
              {steps.map((s, i) => (
                <motion.div key={s.k} className="absolute inset-0 flex items-center justify-center p-10 text-white" animate={{ opacity: active === i ? 1 : 0, scale: active === i ? 1 : 0.96 }} transition={{ duration: 0.5, ease }}>
                  <StepVisual step={s.k} className="w-full" />
                </motion.div>
              ))}
              <div className="absolute inset-x-6 bottom-6 h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full origin-left rounded-full bg-[var(--signal)]" style={{ scaleX: bar }} />
              </div>
            </div>
          </div>
          <ol className="flex flex-col gap-3">
            {steps.map((s, i) => (
              <motion.li key={s.k} animate={{ opacity: active === i ? 1 : 0.28 }} transition={{ duration: 0.4 }} className="border-t border-border py-6">
                <div className="flex items-baseline gap-5">
                  <span className="mono text-caption text-text-3">0{i + 1}</span>
                  <div>
                    <h3 className="text-[clamp(1.5rem,2.4vw,2.25rem)] leading-tight font-semibold">{s.t}</h3>
                    <motion.p initial={false} animate={{ height: active === i ? 'auto' : 0, opacity: active === i ? 1 : 0 }} className="overflow-hidden text-body-lg text-text-2">
                      <span className="block pt-3">{s.d}</span>
                    </motion.p>
                  </div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>

      {/* Mobile and tablet: stacked cards. */}
      <ol className="mx-auto mt-10 flex max-w-[640px] flex-col gap-4 px-5 lg:hidden">
        {steps.map((s, i) => (
          <Reveal key={s.k}>
            <li className="overflow-hidden rounded-xl bg-surface shadow-1">
              <div className="chamber flex h-56 items-center justify-center p-6 text-white">
                <StepVisual step={s.k} className="h-full" />
              </div>
              <div className="p-6">
                <span className="mono text-caption text-text-3">0{i + 1}</span>
                <h3 className="mt-1 text-title-2 font-semibold">{s.t}</h3>
                <p className="mt-2 text-body-lg text-text-2">{s.d}</p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useScan();
  const [stats, setStats] = useState<{ screened: number } | null>(null);
  useEffect(() => {
    api.get<{ screened: number }>('/api/stats/public').then(setStats).catch(() => undefined);
  }, []);
  const start = () => navigate('/start');
  const steps = t('home.steps', { returnObjects: true }) as Step[];
  const trust = t('home.trust', { returnObjects: true }) as string[];
  const marquee = t('home.marquee', { returnObjects: true }) as string[];

  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress: heroP } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const reduce = useReducedMotion();
  const artY = useTransform(heroP, [0, 1], [0, reduce ? 0 : 32]);
  const artScale = useTransform(heroP, [0, 1], [1, reduce ? 1 : 0.97]);

  const bento = [
    { icon: Lock, t: t('home.b1t'), d: t('home.b1d'), span: 'md:col-span-2 md:row-span-2', dark: true },
    { icon: Cpu, t: t('home.b2t'), d: t('home.b2d'), span: '' },
    { icon: WifiOff, t: t('home.b3t'), d: t('home.b3d'), span: '' },
    { icon: Languages, t: t('home.b4t'), d: t('home.b4d'), span: '' },
    { icon: Soup, t: t('home.b5t'), d: t('home.b5d'), span: '', to: '/thali' },
    { icon: Siren, t: t('home.b6t'), d: t('home.b6d'), span: 'md:col-span-2', emergency: true },
  ];

  return (
    <div id="top" className="min-h-dvh overflow-x-clip bg-bg">
      <Nav onStart={start} />

      {/* Hero */}
      <section ref={hero} className="relative mx-auto grid max-w-[1240px] items-center gap-8 px-5 pt-28 pb-16 md:px-10 lg:min-h-dvh lg:grid-cols-[1.1fr_0.9fr] lg:pt-20 lg:pb-0">
        <div className="relative z-10">
          <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
            {t('home.eyebrow')}
          </motion.p>
          <SplitHeading
            className="mt-5 text-mega font-semibold text-balance"
            parts={[{ text: t('home.h1a') }, { text: t('home.h1em'), em: true }, { text: t('home.h1b') }]}
          />
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.6 }} className="mt-6 max-w-xl text-[1.1875rem] leading-relaxed text-text-2 text-pretty">
            {t('home.sub')}
          </motion.p>
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease }} className="mt-9 flex flex-wrap items-center gap-3">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={start} className="group inline-flex h-14 items-center gap-2 rounded-full bg-accent pr-2 pl-7 text-body-lg font-semibold text-on-accent">
              {t('landing.cta')}
              <span className="flex size-10 items-center justify-center rounded-full bg-on-accent/10 transition-transform group-hover:translate-x-0.5">
                <ArrowRight size={18} aria-hidden />
              </span>
            </motion.button>
            {profile && (
              <button onClick={() => navigate('/card')} className="inline-flex h-14 items-center rounded-full bg-sunken px-6 text-body-lg font-semibold">
                {t('landing.resume')}
              </button>
            )}
            <a href="#hospitals" className="inline-flex h-14 items-center gap-1.5 px-3 text-body-lg font-medium text-text-2 hover:text-text">
              {t('home.secondary')} <ArrowUpRight size={18} aria-hidden />
            </a>
          </motion.div>
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-body text-text-3">
            {trust.map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-routine" /> {x}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div style={{ y: artY, scale: artScale }} className="relative mx-auto w-full max-w-[560px]">
          <img src="/art/screening-fold.webp" width="1050" height="788" alt={t('design.screeningArt')} fetchPriority="high" className="block h-auto w-full" />
          <div className="relative grid grid-cols-3 divide-x divide-border border-y border-border py-3">
            {[
              { label: t('card.hr'), value: '72', unit: 'bpm' },
              { label: t('card.visionRow'), value: '6/9', unit: '' },
              { label: t('card.title'), value: t('card.routine'), unit: '' },
            ].map(c => <div key={c.label} className="min-w-0 px-2 sm:px-4">
              <p className="text-caption font-medium text-text-3">{c.label} · {t('home.example')}</p>
              <p className="tnum mt-1 text-body-lg font-semibold leading-tight sm:text-title-3">
                {c.value} {c.unit && <span className="text-caption font-normal text-text-3">{c.unit}</span>}
              </p>
            </div>)}
          </div>
        </motion.div>
      </section>

      {/* Ticker */}
      <div className="border-y border-border py-5 text-title-3 font-medium text-text-2">
        <Marquee items={marquee} />
      </div>

      {/* Problem */}
      <section className="mx-auto max-w-[1240px] px-5 pt-28 md:px-10 md:pt-40">
        <Reveal>
          <p className="eyebrow">{t('home.problemEyebrow')}</p>
          <h2 className="mt-4 max-w-4xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{t('home.problemTitle')}</h2>
          <p className="mt-6 max-w-2xl text-body-lg text-text-2">{t('home.problemBody')}</p>
        </Reveal>
        <div className="mt-16 grid gap-px overflow-hidden rounded-xl bg-border md:grid-cols-3">
          {[
            { v: 110.9, u: 'min', l: t('home.stat1'), dec: 1 },
            { v: 5.3, u: 'min', l: t('home.stat2'), dec: 1 },
            { v: 3, u: 'min', l: t('home.stat3'), em: true },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 0.1} className={`p-8 md:p-10 ${s.em ? 'bg-accent text-on-accent' : 'bg-surface'}`}>
              <p className="flex items-baseline gap-2">
                <CountUp value={s.v} decimals={s.dec ?? 0} className="text-[clamp(3.5rem,7vw,6rem)] leading-none font-semibold tracking-tight" />
                <span className="serif text-title-1 italic opacity-70">{s.u}</span>
              </p>
              <p className={`mt-4 text-body-lg ${s.em ? 'opacity-75' : 'text-text-2'}`}>{s.l}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 text-caption text-text-3">{t('home.statSource')}</p>
        <div className="mt-16 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <Reveal className="rounded-xl bg-surface p-7 shadow-1">
            <p className="eyebrow">{t('home.problemVisual')}</p>
            <div className="mt-5">
              <TimeDonut wait={110.9} consult={5.3} labels={t('home.donut', { returnObjects: true }) as { wait: string; consult: string }} />
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <QueueRace labels={t('home.race', { returnObjects: true }) as { fcfs: string; niktan: string; wait: string; note: string }} />
          </Reveal>
        </div>
      </section>

      <HowItWorks steps={steps} />

      {/* Bento */}
      <section className="mx-auto max-w-[1240px] px-5 pt-28 md:px-10 md:pt-40">
        <Reveal>
          <p className="eyebrow">{t('home.bentoEyebrow')}</p>
          <h2 className="mt-4 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{t('home.bentoTitle')}</h2>
        </Reveal>
        <div className="mt-14 grid auto-rows-[minmax(220px,auto)] gap-4 md:grid-cols-4">
          {bento.map((b, i) => (
            <Reveal key={b.t} delay={(i % 3) * 0.08} className={b.span}>
              <motion.div
                role={b.to ? 'button' : undefined}
                tabIndex={b.to ? 0 : undefined}
                onKeyDown={b.to ? (e) => e.key === 'Enter' && navigate(b.to!) : undefined}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                onClick={b.to ? () => navigate(b.to!) : undefined}
                className={`relative flex size-full flex-col justify-between overflow-hidden rounded-xl p-7 text-left ${b.dark ? 'chamber grain text-white' : b.emergency ? 'bg-emergency-tint' : 'bg-surface shadow-1'} ${b.to ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className={`flex size-12 items-center justify-center rounded-2xl ${b.dark ? 'bg-white/10' : b.emergency ? 'bg-emergency text-emergency-on' : 'bg-sunken'}`}>
                  <b.icon size={22} strokeWidth={1.6} aria-hidden />
                </span>
                {b.dark && (
                  <div className="pointer-events-none absolute -right-16 -bottom-16 size-[22rem] opacity-80">
                    <PulseSphere bpm={64} />
                  </div>
                )}
                <div className="relative mt-10">
                  <h3 className={`font-semibold ${b.dark ? 'max-w-sm text-[clamp(1.75rem,3vw,2.5rem)] leading-tight' : 'text-title-2'}`}>{b.t}</h3>
                  <p className={`mt-2 max-w-md text-body-lg ${b.dark ? 'text-white/65' : b.emergency ? 'text-emergency-ink' : 'text-text-2'}`}>{b.d}</p>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Hospitals */}
      <section id="hospitals" className="px-3 pt-28 md:px-6 md:pt-40">
        <div className="chamber grain mx-auto grid max-w-[1400px] items-center gap-12 overflow-hidden rounded-2xl px-6 py-16 text-white md:px-14 md:py-24 lg:grid-cols-2" style={{ borderRadius: 'var(--radius-2xl)' }}>
          <Reveal>
            <p className="eyebrow !text-white/50">{t('home.hospEyebrow')}</p>
            <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{t('home.hospTitle')}</h2>
            <p className="mt-6 max-w-lg text-body-lg text-white/65">{t('home.hospBody')}</p>
            <button onClick={() => navigate('/hospital')} className="mt-9 inline-flex h-14 items-center gap-2 rounded-full bg-white px-7 text-body-lg font-semibold text-black">
              {t('home.hospCta')} <ArrowUpRight size={18} aria-hidden />
            </button>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="rounded-xl bg-white/[0.03] p-5 ring-1 ring-white/10">
              <div className="mb-4 flex items-center justify-between">
                <span className="mono text-caption tracking-[0.14em] text-white/50 uppercase">{t('home.demoBoard')}</span>
                <motion.span className="size-2 rounded-full bg-[var(--signal-2)]" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} />
              </div>
              <MiniBoard />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-[1240px] px-5 pt-28 md:px-10 md:pt-40">
        <Reveal className="grid gap-10 md:grid-cols-[auto_1fr] md:items-end">
          <div className="flex size-24 items-center justify-center rounded-[28px] bg-accent text-on-accent md:size-32">
            <Lock size={44} strokeWidth={1.4} aria-hidden />
          </div>
          <div>
            <p className="eyebrow">{t('home.privEyebrow')}</p>
            <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold">{t('home.privTitle')}</h2>
            <p className="mt-6 max-w-2xl text-body-lg text-text-2">{t('home.privBody')}</p>
          </div>
        </Reveal>
        <Reveal className="mt-14">
          <DataFlow labels={t('home.flow', { returnObjects: true }) as Parameters<typeof DataFlow>[0]['labels']} />
        </Reveal>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-[1240px] px-5 py-32 text-center md:px-10 md:py-48">
        <Reveal>
          <HeartPulse className="mx-auto text-emergency-text" size={36} strokeWidth={1.4} aria-hidden />
          <p lang="hne" className="serif mt-8 text-[clamp(3rem,10vw,8.5rem)] leading-[0.95]">
            {t('home.endTitle')}
          </p>
          <p className="mt-6 text-title-3 text-text-2">{t('home.endSub')}</p>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={start} className="mt-10 inline-flex h-16 items-center gap-3 rounded-full bg-accent px-9 text-title-3 font-semibold text-on-accent">
            {t('landing.cta')} <ArrowRight size={20} aria-hidden />
          </motion.button>
          {stats && stats.screened > 0 && (
            <p className="mt-6 text-body text-text-3">
              <CountUp value={stats.screened} className="font-semibold text-text" /> {t('landing.screened')}
            </p>
          )}
        </Reveal>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 py-10 pb-[calc(112px+env(safe-area-inset-bottom))] sm:pb-10 text-body text-text-3 md:flex-row md:items-center md:px-10">
          <div className="flex items-center gap-2.5 text-text">
            <Glyph className="size-6" /> <span className="font-semibold">NikTan</span>
          </div>
          <p className="max-w-xl">{t('home.footer')}</p>
          <div className="flex gap-5 md:ml-auto">
            <button onClick={() => navigate('/thali')} className="hover:text-text">{t('home.thali')}</button>
            <button onClick={() => navigate('/hospital')} className="hover:text-text">{t('home.staff')}</button>
            <button onClick={() => navigate('/status')} className="hover:text-text">{t('home.status')}</button>
          </div>
        </div>
      </footer>

      {/* Mobile sticky CTA */}
      <div className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border/70 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden">
        <button onClick={profile ? () => navigate('/card') : start} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-body-lg font-semibold text-on-accent">
          {t(profile ? 'landing.resume' : 'landing.cta')} <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
