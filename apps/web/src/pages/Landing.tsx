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
import { ScreeningPreview } from '../ui/visuals/ScreeningPreview';
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

function MobileSteps({ steps }: { steps: Step[] }) {
  const rail = useRef<HTMLOListElement>(null);
  const [selected, setSelected] = useState(0);
  const reduce = useReducedMotion();
  function moveToStep(index: number) {
    const strip = rail.current;
    const card = strip?.children[index] as HTMLElement | undefined;
    if (strip && card) strip.scrollTo({ left: card.offsetLeft - strip.clientLeft, behavior: reduce ? 'instant' : 'smooth' });
  }
  return (
    <div className="mx-auto mt-7 max-w-[640px] px-5">
      <ol ref={rail} className="relative grid snap-x snap-mandatory auto-cols-[92%] grid-flow-col gap-3 overflow-x-auto overscroll-x-contain rounded-xl no-scrollbar"
        onScroll={event => {
          const strip = event.currentTarget;
          const stride = (strip.children[1] as HTMLElement | undefined)?.offsetLeft;
          if (stride) setSelected(Math.min(steps.length - 1, Math.max(0, Math.round(strip.scrollLeft / stride))));
        }}>
        {steps.map((step, i) => (
          <li key={step.k} className="snap-start overflow-hidden rounded-xl border border-border bg-surface">
            <div className="chamber flex h-48 items-center justify-center p-5 text-white">
              {Math.abs(selected - i) <= 1 && <StepVisual step={step.k} className="h-full" />}
            </div>
            <div className="p-5">
              <h3 className="text-title-2 font-semibold">{step.t}</h3>
              <p className="mt-2 text-body text-text-2">{step.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex justify-center">
        {steps.map((step, i) => (
          <button key={step.k} type="button" aria-label={step.t} aria-current={selected === i ? 'step' : undefined}
            onClick={() => moveToStep(i)} className="grid size-11 place-items-center rounded-full">
            <span className={`h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none ${selected === i ? 'w-6 bg-text' : 'w-2 bg-text-3'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

function HowItWorks({ steps }: { steps: Step[] }) {
  const { t } = useTranslation();
  const [wide, setWide] = useState(() => matchMedia('(min-width: 1024px) and (min-height: 580px)').matches);
  useEffect(() => {
    const media = matchMedia('(min-width: 1024px) and (min-height: 580px)');
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return (
    <section id="how" className="relative">
      <div className="mx-auto max-w-[1240px] px-5 pt-16 md:px-10 md:pt-24">
        <Reveal>
          <p className="eyebrow">{t('home.howEyebrow')}</p>
          <h2 className="mt-4 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{t('home.howTitle')}</h2>
        </Reveal>
      </div>

      {wide ? <PinnedSteps steps={steps} /> : <MobileSteps steps={steps} />}
    </section>
  );
}

function PinnedSteps({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => setActive(Math.min(steps.length - 1, Math.floor(v * steps.length))));
  const reduce = useReducedMotion();
  const tilt = useTransform(scrollYProgress, [0, 0.5, 1], reduce ? [0, 0, 0] : [-5, 0, 5]);

  function moveToStep(index: number) {
    const strip = ref.current;
    if (!strip) return;
    const progress = (index + 0.5) / steps.length;
    window.scrollTo({ top: window.scrollY + strip.getBoundingClientRect().top + (strip.offsetHeight - window.innerHeight) * progress, behavior: 'instant' });
  }

  return (
      <div ref={ref} className="relative mx-auto max-w-[1240px] px-10" style={{ height: `${steps.length * 51}vh` }}>
        <div className="sticky top-12 grid h-[calc(100svh-3rem)] grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-[clamp(2rem,6vw,6rem)]">
          <motion.div style={{ rotateY: tilt, transformPerspective: 900 }} className="relative mx-auto aspect-[9/16] h-[min(63svh,510px)] rounded-[40px] bg-[#171a1b] p-2 shadow-4 ring-1 ring-black/10">
            <div className="chamber relative size-full overflow-hidden rounded-[38px] text-white">
              <div className="absolute inset-x-0 top-3 mx-auto h-6 w-24 rounded-full bg-black" />
              <motion.div key={steps[active]!.k} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="absolute inset-0 flex items-center justify-center p-7 text-white">
                <StepVisual step={steps[active]!.k} className="w-full" />
              </motion.div>
              <div aria-hidden className="absolute inset-x-6 bottom-6 flex gap-1">
                {steps.map((step, i) => <span key={step.k} className={`h-1 flex-1 rounded-full ${i <= active ? 'bg-[var(--signal)]' : 'bg-white/15'}`} />)}
              </div>
            </div>
          </motion.div>
          <ol className="flex flex-col">
            {steps.map((s, i) => (
              <motion.li key={s.k} animate={{ opacity: active === i ? 1 : 0.7 }} transition={{ duration: 0.4 }} className="border-t border-border py-[clamp(.65rem,1.8vh,1.25rem)]">
                <div className="flex items-baseline gap-5">
                  <span className="mono text-caption text-text-3">0{i + 1}</span>
                  <div>
                    <h3 className="text-[clamp(1.5rem,2.4vw,2.25rem)] leading-tight font-semibold"><button type="button" aria-current={active === i ? 'step' : undefined} onClick={() => moveToStep(i)} className="text-left">{s.t}</button></h3>
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
  const bento = [
    { icon: Lock, t: t('home.b1t'), d: t('home.b1d'), span: 'sm:col-span-2 lg:row-span-2', dark: true },
    { icon: Cpu, t: t('home.b2t'), d: t('home.b2d'), span: '' },
    { icon: WifiOff, t: t('home.b3t'), d: t('home.b3d'), span: '' },
    { icon: Languages, t: t('home.b4t'), d: t('home.b4d'), span: '' },
    { icon: Soup, t: t('home.b5t'), d: t('home.b5d'), span: '', to: '/thali' },
    { icon: Siren, t: t('home.b6t'), d: t('home.b6d'), span: 'sm:col-span-2 lg:col-span-4', emergency: true },
  ];

  return (
    <div id="top" className="min-h-dvh overflow-x-clip bg-bg">
      <Nav onStart={start} />

      {/* Hero */}
      <section ref={hero} className="landing-night relative mx-auto grid max-w-[1240px] items-center gap-8 px-5 pt-24 pb-10 md:px-10 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[900px]:gap-[clamp(2rem,4vw,4rem)] min-[900px]:pt-[clamp(6.5rem,15svh,9rem)] min-[900px]:pb-[clamp(2.5rem,7svh,5rem)]">
        <div className="relative z-10">
          <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
            {t('home.eyebrow')}
          </motion.p>
          <SplitHeading
            className="mt-4 text-[clamp(2.85rem,5.7vw,5.25rem)] leading-[1.01] font-semibold tracking-[-0.05em] text-balance"
            parts={[{ text: t('home.h1a') }, { text: t('home.h1em'), em: true }, { text: t('home.h1b') }]}
          />
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.6 }} className="mt-6 max-w-xl text-[1.1875rem] leading-relaxed text-text-2 text-pretty">
            {t('home.sub')}
          </motion.p>
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease }} className="mt-6 flex flex-wrap items-center gap-3">
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
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-body text-text-3">
            {trust.map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-routine" /> {x}
              </li>
            ))}
          </motion.ul>
        </div>

        <ScreeningPreview progress={heroP} />
      </section>

      {/* Ticker */}
      <div className="border-y border-border py-5 text-title-3 font-medium text-text-2">
        <Marquee items={marquee} />
      </div>

      {/* Problem */}
      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-10 md:pt-24">
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
      <section className="mx-auto max-w-[1240px] px-5 pt-16 md:px-10 md:pt-24">
        <Reveal>
          <p className="eyebrow">{t('home.bentoEyebrow')}</p>
          <h2 className="mt-4 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{t('home.bentoTitle')}</h2>
        </Reveal>
        <div className="mt-14 grid auto-rows-[minmax(220px,auto)] gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <section id="hospitals" className="px-3 pt-16 md:px-6 md:pt-24">
        <div className="landing-hospital chamber grain mx-auto grid max-w-[1400px] items-center gap-12 overflow-hidden rounded-2xl px-6 py-16 text-white md:px-14 md:py-24 lg:grid-cols-2" style={{ borderRadius: 'var(--radius-2xl)' }}>
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
      <section id="privacy" className="mx-auto max-w-[1240px] px-5 pt-16 md:px-10 md:pt-24">
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
      <section className="mx-auto max-w-[1240px] px-5 py-20 text-center md:px-10 md:py-28">
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
