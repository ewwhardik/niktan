import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useScan } from '../../state/scan';
import { StepRail } from '../../ui/Chamber';
import { LangToggle } from '../../ui/Layout';
import { screenVariants } from '../../ui/motion';
import { VoiceGuide } from './VoiceGuide';

export const STEPS = ['face', 'eye', 'vision', 'hearing', 'symptoms'] as const;
export type StepId = (typeof STEPS)[number];

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
}

export default function ScanStep() {
  const { step } = useParams<{ step: StepId }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useScan();
  const index = STEPS.indexOf(step as StepId);
  const prev = useRef(index);
  const dir = index >= prev.current ? 1 : -1;
  useEffect(() => {
    prev.current = index;
  }, [index]);

  // The scan runs in a dark "chamber": the status bar should match it.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
    meta.setAttribute('content', '#000000');
    return () => meta.remove();
  }, []);

  if (!profile) return <Navigate to="/info" replace />;
  if (index < 0) return <Navigate to="/scan/face" replace />;

  const id = STEPS[index]!;
  const Step = components[id];
  const next = () => navigate(index + 1 < STEPS.length ? `/scan/${STEPS[index + 1]}` : '/card');

  return (
    <div className="chamber min-h-dvh">
      <header className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2 lg:gap-6 lg:px-10 lg:pt-6">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(index > 0 ? `/scan/${STEPS[index - 1]}` : '/info')}
          aria-label={t('common.back')}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-text hover:bg-white/10"
        >
          <ArrowLeft size={20} strokeWidth={1.8} />
        </motion.button>
        <StepRail steps={STEPS} index={index} labels={STEPS.map((s) => t(`steps.${s}`))} />
        <LangToggle compact />
      </header>
      <div className="mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[1280px] flex-col px-5 lg:px-10">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={id} custom={dir} variants={screenVariants} initial="enter" animate="center" exit="exit" className="flex flex-1 flex-col">
            <Suspense fallback={<div className="flex-1" />}>
              {id === 'face' || id === 'eye' ? (
                <Step next={next} guide={<VoiceGuide step={id} />} />
              ) : (
                <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col lg:pt-6">
                  <Step next={next} guide={<VoiceGuide step={id} />} />
                </div>
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
