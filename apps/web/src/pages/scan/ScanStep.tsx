import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { SCREENING_STEPS, STEP_MINUTES, stepsFor, useScan, type ScreeningStep } from '../../state/scan';
import { StepRail } from '../../ui/Chamber';
import { LangToggle } from '../../ui/Layout';
import { screenVariants } from '../../ui/motion';
import { VoiceGuide } from './VoiceGuide';

const ALL = SCREENING_STEPS.map(({ route }) => route);

const components = {
  face: lazy(() => import('./FaceVitals')),
  eye: lazy(() => import('./EyeScan')),
  vision: lazy(() => import('./VisionTest')),
  hearing: lazy(() => import('./HearingTest')),
  symptoms: lazy(() => import('./SymptomsStep')),
};

export interface StepProps {
  next: () => void;
  guide: ReactNode;
  /** "02 / 03" in the plan, or "+" for an extra check added from the card. */
  position: string;
}

export default function ScanStep() {
  const { step } = useParams<{ step: ScreeningStep }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, results, plan } = useScan();
  // A step outside the plan (added later from the Health Card) runs on its own and returns to the card.
  const planned = stepsFor(plan).map(({ route }) => route);
  const extra = step !== undefined && ALL.includes(step) && !planned.includes(step);
  const STEPS = extra ? [step] : planned;
  const index = step === undefined ? -1 : STEPS.indexOf(step);
  const prev = useRef(index);
  const dir = index >= prev.current ? 1 : -1;
  const [saved, setSaved] = useState<{ step: ScreeningStep; skipped: boolean } | null>(null);
  useEffect(() => {
    // Moving forward: confirm what happened to the step just left.
    if (index > prev.current && prev.current >= 0) {
      const left = SCREENING_STEPS.find((s) => s.route === STEPS[prev.current])!;
      setSaved({ step: left.route, skipped: results[left.module] === null || results[left.module] === undefined });
      const id = window.setTimeout(() => setSaved(null), 2200);
      prev.current = index;
      return () => clearTimeout(id);
    }
    prev.current = index;
  }, [index]);

  // The scan runs in a dark "chamber": the status bar should match it, then restore on exit.
  useEffect(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((m) => m.content);
    metas.forEach((m) => (m.content = '#000000'));
    return () => metas.forEach((m, i) => (m.content = before[i]!));
  }, []);

  if (!profile) return <Navigate to="/info" replace />;
  if (index < 0) return <Navigate to="/scan/face" replace />;

  const id = STEPS[index]!;
  const Step = components[id];
  const next = () => navigate(index + 1 < STEPS.length ? `/scan/${STEPS[index + 1]}` : '/card');
  const pad = (n: number) => String(n).padStart(2, '0');
  const position = extra ? '+' : `${pad(index + 1)} / ${pad(STEPS.length)}`;
  const back = () => navigate(extra ? '/card' : index > 0 ? `/scan/${STEPS[index - 1]}` : '/info');
  const minLeft = Math.max(1, Math.round(STEPS.slice(index).reduce((m, s) => m + STEP_MINUTES[s], 0)));

  return (
    <div className="chamber min-h-dvh">
      <header className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2 lg:gap-6 lg:px-10 lg:pt-6">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={back}
          aria-label={t('common.back')}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-text hover:bg-white/10"
        >
          <ArrowLeft size={20} strokeWidth={1.8} />
        </motion.button>
        <StepRail steps={STEPS} index={index} labels={STEPS.map((s) => t(`steps.${s}`))} />
        <LangToggle compact />
      </header>
      <p className="mx-auto max-w-[1280px] px-5 text-caption text-text-3 lg:px-10 xl:hidden" aria-live="polite">
        {extra ? t('scan.extraStep', { name: t(`steps.${id}`), min: minLeft }) : t('scan.stepOf', { n: index + 1, total: STEPS.length, name: t(`steps.${id}`), min: minLeft })}
      </p>
      <AnimatePresence>
        {saved && (
          <motion.div key={saved.step} role="status" initial={{ opacity: 0, y: -12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="fixed top-[max(96px,calc(env(safe-area-inset-top)+88px))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-label font-medium text-black shadow-3">
            {saved.skipped ? <SkipForward size={15} aria-hidden /> : <Check size={15} className="text-[#34c759]" aria-hidden />}
            {t(saved.skipped ? 'scan.skipped' : 'scan.saved', { name: t(`steps.${saved.step}`) })}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[1280px] flex-col px-5 lg:px-10">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={id} custom={dir} variants={screenVariants} initial="enter" animate="center" exit="exit" className="flex flex-1 flex-col">
            <Suspense fallback={<div className="flex-1" />}>
              {id === 'face' || id === 'eye' ? (
                <Step next={next} guide={<VoiceGuide step={id} />} position={position} />
              ) : (
                <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col lg:pt-6">
                  <Step next={next} guide={<VoiceGuide step={id} />} position={position} />
                </div>
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
