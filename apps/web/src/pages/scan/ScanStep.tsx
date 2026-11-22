import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useScan } from '../../state/scan';
import { Screen, Stepper, TopBar } from '../../ui/Layout';
import { screenVariants } from '../../ui/motion';

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

  if (!profile) return <Navigate to="/info" replace />;
  if (index < 0) return <Navigate to="/scan/face" replace />;

  const id = STEPS[index]!;
  const Step = components[id];
  const next = () => navigate(index + 1 < STEPS.length ? `/scan/${STEPS[index + 1]}` : '/card');

  return (
    <Screen className="pb-0">
      <TopBar onBack={() => navigate(index > 0 ? `/scan/${STEPS[index - 1]}` : '/info')} title={t(`steps.${id}`)} />
      <Stepper index={index} total={STEPS.length} label={t('steps.of', { n: index + 1, total: STEPS.length })} />
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div key={id} custom={dir} variants={screenVariants} initial="enter" animate="center" exit="exit" className="flex flex-1 flex-col">
          <Suspense fallback={<div className="flex-1" />}>
            <Step next={next} />
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </Screen>
  );
}
