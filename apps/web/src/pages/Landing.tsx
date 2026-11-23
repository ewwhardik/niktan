import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check, ClipboardList, Cpu, FileText, HeartPulse, Languages, Lock, Siren, Soup, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { SCREENING_STEPS, useScan } from '../state/scan';
import { BrandMark } from '../ui/BrandMark';
import { LangToggle } from '../ui/Layout';
import { CountUp } from '../ui/Numbers';
import { Marquee } from '../ui/visuals/Marquee';
import { MiniBoard } from '../ui/visuals/MiniBoard';
import { StepVisual, type StepKey } from '../ui/visuals/StepVisual';
import { DataFlow, NutrientRings, QueueRace, TimeDonut } from '../ui/visuals/Infographics';
import { Decode, Magnetic, TiltCard } from '../ui/fx';
import { Constellation, FoundationCards, HeroConsole, NotificationStack, PillEye, PillHeart, RxShowcase, ThaliPlate, TriageHub } from '../ui/visuals/LandingVisuals';
import { ease } from '../ui/motion';
import '../styles/landing.css';

interface Step {
  k: StepKey;
  t: string;
  d: string;
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-12% 0px' }} transition={{ duration: 0.8, ease, delay }}>
      {children}
    </motion.div>
  );
}

/** Words rise out of a mask one by one; `slot` items are inline pills placed between the parts. */
function SplitHeading({ parts, className = '' }: { parts: ({ text: string; em?: boolean } | { slot: ReactNode })[]; className?: string }) {
  let i = 0;
  return (
    <h1 className={className}>
      {parts.map((p, pi) => {
        if ('slot' in p) {
          const d = 0.08 + i++ * 0.07;
          return (
            <motion.span key={pi} className="lp-pill" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: d + 0.15 }} aria-hidden>
              {p.slot}
            </motion.span>
          );
        }
        return p.text.split(' ').filter(Boolean).map((w, wi) => {
          const d = 0.08 + i++ * 0.07;
          return (
            <span key={`${pi}-${wi}`} className="inline-block overflow-hidden pb-[0.1em] align-bottom">
              <motion.span className={`inline-block ${p.em ? 'serif italic text-text-3' : ''}`} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease, delay: d }}>
                {w}&nbsp;
              </motion.span>
            </span>
          );
        });
      })}
    </h1>
  );
}

function Nav({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 24));
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-[max(12px,env(safe-area-inset-top))]">
      <motion.nav initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7, ease }}
        className={`lp-nav mx-auto flex h-14 items-center gap-4 rounded-full pr-2 pl-4 transition-[max-width] duration-500 ${scrolled ? 'max-w-[980px]' : 'max-w-[1080px]'}`}>
        <a href="#top" className="flex shrink-0 items-center gap-2">
          <BrandMark className="size-6 dark:brightness-0 dark:invert" />
          <span className="text-title-3 font-semibold tracking-tight">NikTan</span>
          <span className="serif hidden text-title-3 text-text-3 sm:inline">निकतन</span>
        </a>
        <div className="mx-auto hidden items-center gap-1 text-label text-text-2 lg:flex">
          {[['#thali', t('home.thaliEyebrow')], ['#rx', t('home.rxEyebrow')], ['#hospitals', t('home.nav.hospitals')]].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full px-3 py-2 whitespace-nowrap transition-colors hover:text-text">{label}</a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <LangToggle compact />
          <motion.button whileTap={{ scale: 0.96 }} onClick={onStart} className="lp-cta hidden h-10 items-center gap-1.5 rounded-full px-5 text-label font-semibold whitespace-nowrap sm:inline-flex">
            {t('home.nav.start')}
          </motion.button>
        </div>
      </motion.nav>
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
          <li key={step.k} className="lp-card snap-start overflow-hidden rounded-3xl">
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
      <div className="mx-auto max-w-[1240px] px-5 pt-24 text-center md:px-10 md:pt-32">
        <Reveal>
          <p className="eyebrow">{t('home.howEyebrow')}</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{t('home.howTitle')}</h2>
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
        <div className="relative">
          <motion.div style={{ rotateY: tilt, transformPerspective: 900 }} className="relative mx-auto aspect-[9/16] h-[min(63svh,510px)] rounded-[40px] bg-[#1d1d1f] p-2 shadow-4 ring-1 ring-white/10">
            <div className="chamber relative size-full overflow-hidden rounded-[34px] text-white">
              <div className="absolute inset-x-0 top-3 mx-auto h-6 w-24 rounded-full bg-black" />
              <motion.div key={steps[active]!.k} initial={reduce ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.35, ease }} className="absolute inset-0 flex items-center justify-center p-7 text-white">
                <StepVisual step={steps[active]!.k} className="w-full" />
              </motion.div>
              <div aria-hidden className="absolute inset-x-6 bottom-6 flex gap-1">
                {steps.map((step, i) => (
                  <span key={step.k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                    <motion.span className="block h-full origin-left bg-white" initial={false} animate={{ scaleX: i <= active ? 1 : 0 }} transition={{ duration: 0.4, ease }} />
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
        <ol className="flex flex-col">
          {steps.map((s, i) => (
            <motion.li key={s.k} animate={{ opacity: active === i ? 1 : 0.55 }} transition={{ duration: 0.4 }} className="relative border-t border-border py-[clamp(.65rem,1.8vh,1.25rem)]">
              {active === i && <motion.span layoutId="how-bar" className="absolute -top-px left-0 h-px w-full bg-text" transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
              <div className="flex items-baseline gap-5">
                <span className={`mono text-caption ${active === i ? 'text-text' : 'text-text-3'}`}>0{i + 1}</span>
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

function SectionHead({ eyebrow, title, body, center = false }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <Reveal className={center ? 'mx-auto text-center' : ''}>
      <p className="eyebrow"><Decode text={eyebrow} /></p>
      <h2 className={`mt-4 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance ${center ? 'mx-auto' : ''}`}>{title}</h2>
      {body && <p className={`mt-6 max-w-2xl text-body-lg text-text-2 ${center ? 'mx-auto' : ''}`}>{body}</p>}
    </Reveal>
  );
}

export function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, results } = useScan();
  const nextStep = profile && SCREENING_STEPS.find(({ module }) => results[module] === undefined);
  const [stats, setStats] = useState<{ screened: number } | null>(null);
  useEffect(() => {
    api.get<{ screened: number }>('/api/stats/public').then(setStats).catch(() => undefined);
  }, []);
  const start = () => navigate('/start');
  const startOrContinue = () => nextStep ? navigate(`/scan/${nextStep.route}`) : start();
  const steps = t('home.steps', { returnObjects: true }) as Step[];
  const trust = t('home.trust', { returnObjects: true }) as string[];
  const marquee = t('home.marquee', { returnObjects: true }) as string[];

  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress: heroP } = useScroll({ target: hero, offset: ['start start', 'end start'] });

  return (
    <div id="top" className="lp min-h-dvh overflow-x-clip">
      <Nav onStart={start} />

      {/* Hero: centred statement, then the doctor's view rising into place */}
      <section ref={hero} className="lp-hero relative isolate px-5 pt-[clamp(7rem,16svh,9.5rem)] pb-12 md:px-10">
        <div className="mx-auto max-w-[980px] text-center">
          <motion.a href="#how" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-sunken py-1.5 pr-3 pl-1.5 text-caption text-text-2">
            <span className="rounded-full bg-[var(--lp-card)] px-2 py-0.5 font-semibold whitespace-nowrap text-text shadow-1">{t('home.live')}</span>
            <span className="hidden whitespace-nowrap sm:inline">{t('home.eyebrow')}</span> <ArrowRight size={13} aria-hidden />
          </motion.a>
          <SplitHeading
            className="mt-6 text-[clamp(2.75rem,7.2vw,6.25rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance"
            parts={[{ text: t('home.h1a') }, { slot: <PillHeart /> }, { text: t('home.h1em'), em: true }, { slot: <PillEye /> }, { text: t('home.h1b') }]}
          />
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.6 }} className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-relaxed text-text-2 text-pretty">
            {t('home.sub')}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.75 }} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Magnetic><motion.button whileTap={{ scale: 0.97 }} onClick={startOrContinue} className="lp-cta group inline-flex h-14 items-center gap-2 rounded-full pr-2 pl-7 text-body-lg font-semibold">
              {t(nextStep ? 'landing.continue' : 'landing.cta')}
              <span className="flex size-10 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:translate-x-0.5">
                <ArrowRight size={18} aria-hidden />
              </span>
            </motion.button></Magnetic>
            <Link to="/card" className="inline-flex min-h-14 items-center gap-2 rounded-full border border-border bg-sunken px-5 text-body-lg font-semibold transition-colors hover:bg-border">
              <ClipboardList size={20} strokeWidth={1.75} aria-hidden /> {t('landing.healthCard')}
            </Link>
            <a href="#hospitals" className="lp-link inline-flex h-14 items-center gap-1 px-4 text-body-lg font-medium">
              {t('home.secondary')} <ArrowUpRight size={18} aria-hidden />
            </a>
          </motion.div>
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-body text-text-3">
            {trust.map((x) => (
              <li key={x} className="flex items-center gap-2"><span className="size-1 rounded-full bg-text-3" /> {x}</li>
            ))}
          </motion.ul>
        </div>
        <div className="mt-14 md:mt-20">
          <HeroConsole progress={heroP} />
        </div>
      </section>

      {/* Module strip */}
      <div className="border-y border-border py-6 text-title-3 font-medium text-text-3">
        <Marquee items={marquee} />
      </div>

      {/* Constellation banner */}
      <section className="mx-auto max-w-[1240px] px-5 pt-24 md:px-10 md:pt-32">
        <Reveal className="lp-card relative grid items-center gap-8 overflow-hidden rounded-[32px] p-6 md:p-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="relative">
            <p className="eyebrow">{t('home.problemEyebrow')}</p>
            <h2 className="mt-4 text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] font-semibold text-balance">{t('home.consTitle')}</h2>
            <p className="mt-5 max-w-md text-body-lg text-text-2">{t('home.consBody')}</p>
          </div>
          <div className="relative">
            <Constellation tags={t('home.consTags', { returnObjects: true }) as string[]} />
          </div>
        </Reveal>
      </section>

      {/* Evidence, on paper */}
      <section className="lp-band mt-24 rounded-t-[40px] px-5 pt-20 pb-28 md:mt-32 md:px-10 md:pt-28 md:pb-36">
        <div className="mx-auto max-w-[1240px]">
          <SectionHead eyebrow={t('home.problemVisual')} title={t('home.problemTitle')} body={t('home.problemBody')} />
          <div className="mt-12 grid border-y border-border md:mt-16 md:grid-cols-3 md:divide-x md:divide-border">
            {[
              { v: 110.9, u: 'min', l: t('home.stat1'), dec: 1 },
              { v: 5.3, u: 'min', l: t('home.stat2'), dec: 1 },
              { v: 3, u: 'min', l: t('home.stat3'), em: true },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.1} className="border-b border-border py-8 last:border-b-0 md:border-b-0 md:px-8 md:first:pl-0">
                <p className="flex items-baseline gap-2">
                  <CountUp value={s.v} decimals={s.dec ?? 0} className={`text-[clamp(3.5rem,7vw,6rem)] leading-none font-semibold tracking-tight ${s.em ? 'text-[var(--lp-accent)]' : ''}`} />
                  <span className="serif text-title-1 italic opacity-60">{s.u}</span>
                </p>
                <p className="mt-4 text-body-lg text-text-2">{s.l}</p>
              </Reveal>
            ))}
          </div>
          <p className="mt-4 text-caption text-text-3">{t('home.statSource')}</p>
          <div className="mt-12 grid gap-6 md:mt-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center [&>*]:min-w-0">
            <Reveal className="lp-card rounded-[28px] p-6 md:p-7">
              <p className="eyebrow">{t('home.problemVisual')}</p>
              <div className="mt-5">
                <TimeDonut wait={110.9} consult={5.3} labels={t('home.donut', { returnObjects: true }) as { wait: string; consult: string }} />
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <QueueRace labels={t('home.race', { returnObjects: true }) as { fcfs: string; niktan: string; wait: string; note: string }} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Engine */}
      <section id="engine" className="relative -mt-10 rounded-t-[40px] bg-[var(--bg)] px-5 pt-20 md:px-10 md:pt-28">
        <div className="mx-auto max-w-[1240px]">
          <SectionHead eyebrow={t('home.hubEyebrow')} title={t('home.hubTitle')} body={t('home.hubBody')} center />
          <div className="mt-12 md:mt-16">
            <TriageHub modules={steps.map((s) => s.t)} short={t('home.hubShort', { returnObjects: true }) as string[]} engine={t('home.hubEngine')} outs={t('home.hubOut', { returnObjects: true }) as string[]} />
          </div>
        </div>
      </section>

      <HowItWorks steps={steps} />

      {/* Bento */}
      <section className="mx-auto max-w-[1240px] px-5 pt-24 md:px-10 md:pt-32">
        <SectionHead eyebrow={t('home.bentoEyebrow')} title={t('home.bentoTitle')} center />
        <div className="mt-12 grid gap-4 md:mt-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <TiltCard className="h-full rounded-[28px]">
              <div className="lp-tile relative flex h-full min-h-[300px] flex-col justify-between gap-10 overflow-hidden rounded-[28px] p-7 md:p-8">
                <span className="grid size-12 place-items-center rounded-2xl bg-white/10"><Lock size={22} aria-hidden /></span>
                <div>
                  <h3 className="max-w-sm text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-semibold">{t('home.b1t')}</h3>
                  <p className="mt-3 max-w-sm text-body-lg text-white/65">{t('home.b1d')}</p>
                </div>
              </div>
            </TiltCard>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-7">
            <TiltCard className="h-full rounded-[28px]" max={4}>
              <div className="lp-card grid h-full gap-6 rounded-[28px] p-7 md:grid-cols-[0.8fr_1.2fr] md:items-center md:p-8">
                <div>
                  <span className="grid size-12 place-items-center rounded-2xl bg-sunken"><Siren size={22} className="text-emergency-text" aria-hidden /></span>
                  <h3 className="mt-6 text-title-1 font-semibold md:mt-8">{t('home.notifTitle')}</h3>
                  <p className="mt-2 text-body-lg text-text-2">{t('home.notifBody')}</p>
                </div>
                <NotificationStack items={t('home.notifs', { returnObjects: true }) as string[]} />
              </div>
            </TiltCard>
          </Reveal>
          {[
            { icon: Cpu, t: t('home.b2t'), d: t('home.b2d'), link: true },
            { icon: WifiOff, t: t('home.b3t'), d: t('home.b3d') },
            { icon: Languages, t: t('home.b4t'), d: t('home.b4d') },
          ].map((b, i) => (
            <Reveal key={b.t} delay={i * 0.08} className="lg:col-span-4">
              <TiltCard className="h-full rounded-[28px]">
                <div className="lp-card flex h-full min-h-[240px] flex-col justify-between gap-8 rounded-[28px] p-7">
                  <span className="grid size-12 place-items-center rounded-2xl bg-sunken"><b.icon size={22} strokeWidth={1.6} aria-hidden /></span>
                  <div>
                    <h3 className="text-title-2 font-semibold">{b.t}</h3>
                    <p className="mt-2 text-body-lg text-text-2">{b.d}</p>
                    {b.link && <a href="#engine" className="lp-link mt-2 inline-flex min-h-11 items-center gap-1 text-body-lg font-medium">{t('home.rulesCta')} <ArrowUpRight size={16} aria-hidden /></a>}
                  </div>
                </div>
              </TiltCard>
            </Reveal>
          ))}
          <Reveal className="lg:col-span-12">
            <div className="flex flex-col gap-5 rounded-[28px] bg-emergency-tint p-7 md:flex-row md:items-center md:p-8">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-emergency text-emergency-on"><Siren size={24} aria-hidden /></span>
              <div>
                <h3 className="text-title-1 font-semibold">{t('home.b6t')}</h3>
                <p className="mt-1 text-body-lg text-emergency-ink">{t('home.b6d')}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Thali */}
      <section id="thali" className="mx-auto max-w-[1240px] px-5 pt-24 md:px-10 md:pt-32">
        <div className="lp-card grid items-center gap-10 overflow-hidden rounded-[40px] px-6 py-12 md:px-12 md:py-16 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow"><Decode text={t('home.thaliEyebrow')} /></p>
            <h2 className="mt-4 text-[clamp(2rem,4.4vw,3.5rem)] leading-[1.05] font-semibold text-balance">{t('home.thaliTitle')}</h2>
            <p className="mt-5 max-w-lg text-body-lg text-text-2">{t('home.thaliBody')}</p>
            <ul className="mt-7 flex flex-col gap-3">
              {(t('home.thaliPoints', { returnObjects: true }) as string[]).map((point) => (
                <li key={point} className="flex items-start gap-3 text-body-lg">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-sunken"><Check size={14} aria-hidden /></span>{point}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Magnetic>
                <button onClick={() => navigate('/thali')} className="lp-cta inline-flex h-14 items-center gap-2 rounded-full px-7 text-body-lg font-semibold">
                  <Soup size={18} aria-hidden /> {t('home.thaliCta')}
                </button>
              </Magnetic>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <ThaliPlate dishes={t('home.thaliDishes', { returnObjects: true }) as string[]} />
            <div className="mt-6 flex justify-center">
              <NutrientRings center={t('home.thaliMeal')} rings={[
                { label: t('thali.protein'), share: 0.62, color: 'var(--lp-accent)' },
                { label: t('thali.iron'), share: 0.48, color: 'var(--emergency)' },
                { label: t('thali.fibre'), share: 0.71, color: 'var(--routine)' },
              ]} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Prescription reader */}
      <section id="rx" className="mx-auto max-w-[1240px] px-5 pt-24 md:px-10 md:pt-32">
        <div className="lp-card grid items-center gap-10 overflow-hidden rounded-[40px] px-6 py-12 md:px-12 md:py-16 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <Reveal className="lg:order-2">
            <p className="eyebrow"><Decode text={t('home.rxEyebrow')} /></p>
            <h2 className="mt-4 text-[clamp(2rem,4.4vw,3.5rem)] leading-[1.05] font-semibold text-balance">{t('home.rxTitle')}</h2>
            <p className="mt-5 max-w-lg text-body-lg text-text-2">{t('home.rxBody')}</p>
            <ul className="mt-7 flex flex-col gap-3">
              {(t('home.rxPoints', { returnObjects: true }) as string[]).map((point) => (
                <li key={point} className="flex items-start gap-3 text-body-lg">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-sunken"><Check size={14} aria-hidden /></span>{point}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Magnetic>
                <button onClick={() => navigate('/rx')} className="lp-cta inline-flex h-14 items-center gap-2 rounded-full px-7 text-body-lg font-semibold">
                  <FileText size={18} aria-hidden /> {t('home.rxCta')}
                </button>
              </Magnetic>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="lg:order-1">
            <RxShowcase />
          </Reveal>
        </div>
      </section>

      {/* Foundation, on paper */}
      <section className="lp-band mt-24 rounded-[40px] px-5 py-20 md:mx-3 md:mt-32 md:px-10 md:py-28">
        <div className="mx-auto max-w-[1240px]">
          <SectionHead eyebrow={t('home.privEyebrow')} title={t('home.foundTitle')} center />
          <div className="mt-12 md:mt-16">
            <FoundationCards items={t('home.found', { returnObjects: true }) as { t: string; d: string }[]} />
          </div>
        </div>
      </section>

      {/* Hospitals */}
      <section id="hospitals" className="mx-auto max-w-[1240px] px-5 pt-24 md:px-10 md:pt-32">
        <div className="lp-card relative grid items-center gap-10 overflow-hidden rounded-[40px] px-6 py-12 md:px-12 md:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <Reveal className="relative">
            <p className="eyebrow">{t('home.hospEyebrow')}</p>
            <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold text-balance">{t('home.hospTitle')}</h2>
            <p className="mt-6 max-w-lg text-body-lg text-text-2">{t('home.hospBody')}</p>
            <button onClick={() => navigate('/hospital')} className="lp-cta mt-9 inline-flex h-14 items-center gap-2 rounded-full px-7 text-body-lg font-semibold">
              {t('home.hospCta')} <ArrowUpRight size={18} aria-hidden />
            </button>
          </Reveal>
          <Reveal delay={0.15} className="relative [perspective:1400px]">
            <div className="lp-tile rounded-3xl p-4 transition-transform duration-700 ease-out sm:p-5 lg:[transform:rotateY(-10deg)_rotateX(6deg)] lg:hover:[transform:none]">
              <div className="mb-4 flex items-center justify-between">
                <span className="mono text-caption tracking-[0.14em] text-white/50 uppercase">{t('home.demoBoard')}</span>
                <motion.span className="size-2 rounded-full bg-routine" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} />
              </div>
              <MiniBoard />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="mx-auto max-w-[1240px] px-5 pt-24 md:px-10 md:pt-32">
        <Reveal className="grid gap-10 md:grid-cols-[auto_1fr] md:items-end">
          <div className="lp-tile grid size-24 place-items-center rounded-[28px] md:size-32">
            <Lock size={44} strokeWidth={1.4} aria-hidden />
          </div>
          <div>
            <p className="eyebrow">{t('home.privEyebrow')}</p>
            <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] font-semibold">{t('home.privTitle')}</h2>
            <p className="mt-6 max-w-2xl text-body-lg text-text-2">{t('home.privBody')}</p>
          </div>
        </Reveal>
        <Reveal className="mt-12 md:mt-16">
          <DataFlow labels={t('home.flow', { returnObjects: true }) as Parameters<typeof DataFlow>[0]['labels']} />
        </Reveal>
      </section>

      {/* Closing */}
      <section className="relative px-5 pt-28 pb-24 text-center md:px-10 md:pt-40 md:pb-32">
        <Reveal className="relative">
          <HeartPulse className="mx-auto text-[var(--lp-heart)]" size={36} strokeWidth={1.4} aria-hidden />
          <p lang="hne" className="serif mt-8 text-[clamp(3rem,10vw,8.5rem)] leading-[0.95]">{t('home.endTitle')}</p>
          <p className="mt-6 text-title-3 text-text-2">{t('home.endSub')}</p>
          <div className="mt-10"><Magnetic><motion.button whileTap={{ scale: 0.97 }} onClick={start} className="lp-cta inline-flex h-16 items-center gap-3 rounded-full px-9 text-title-3 font-semibold">
            {t('home.endCta')} <ArrowRight size={20} aria-hidden />
          </motion.button></Magnetic></div>
          {stats && stats.screened > 0 && (
            <p className="mt-6 text-body text-text-3">
              <CountUp value={stats.screened} className="font-semibold text-text" /> {t('landing.screened')}
            </p>
          )}
        </Reveal>
      </section>

      <footer className="relative overflow-hidden border-t border-border">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-5 pt-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-10">
          <div>
            <div className="flex items-center gap-2.5"><BrandMark className="size-6 dark:brightness-0 dark:invert" /> <span className="font-semibold">NikTan</span></div>
            <p className="mt-4 max-w-sm text-body text-text-3">{t('home.footer')}</p>
            <p className="mt-4 text-body text-text-2">
              {t('home.builtBy')} <span className="font-semibold text-text">Sai Ram Dash</span>
            </p>
            <div className="mt-1 flex gap-5 text-body">
              <a href="https://github.com/ewwhardik" target="_blank" rel="noreferrer" className="lp-link inline-flex min-h-11 items-center">GitHub</a>
              <a href="https://www.linkedin.com/in/ewwhardik" target="_blank" rel="noreferrer" className="lp-link inline-flex min-h-11 items-center">LinkedIn</a>
            </div>
          </div>
          {(t('home.footCols', { returnObjects: true }) as string[]).map((col, ci) => (
            <div key={col}>
              <p className="eyebrow">{col}</p>
              <ul className="mt-3 flex flex-col text-body text-text-2">
                {(ci === 0
                  ? [[t('home.footHow'), () => document.getElementById('how')?.scrollIntoView()], [t('home.thali'), () => navigate('/thali')], [t('home.rxCta'), () => navigate('/rx')], [t('landing.cta'), start]]
                  : ci === 1
                    ? [[t('home.staff'), () => navigate('/hospital')], [t('home.footBoard'), () => navigate('/hospital/board')]]
                    : [[t('home.nav.privacy'), () => document.getElementById('privacy')?.scrollIntoView()], [t('home.status'), () => navigate('/status')], [t('home.footFeedback'), () => navigate('/feedback')]]
                ).map(([label, go]) => (
                  <li key={label as string}><button onClick={go as () => void} className="-my-1.5 min-h-11 text-left hover:text-text">{label as string}</button></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p aria-hidden className="lp-footer-wordmark mx-auto mt-10 w-fit px-1 text-center font-semibold select-none sm:mt-14">NikTan</p>
        <div className="pb-[calc(144px+env(safe-area-inset-bottom))] sm:pb-6" />
      </footer>

      {/* Mobile sticky CTA */}
      <div className="lp-nav fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 rounded-full p-1.5 sm:hidden">
        <button onClick={profile && !nextStep ? () => navigate('/card') : startOrContinue} className="lp-cta flex h-12 w-full items-center justify-center gap-2 rounded-full text-body-lg font-semibold">
          {t(nextStep ? 'landing.continue' : profile ? 'landing.resume' : 'landing.cta')} <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
