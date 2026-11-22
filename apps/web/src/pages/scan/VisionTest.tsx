import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CreditCard, EyeOff, Glasses } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { visionNeedsReferral } from '@niktan/core';
import { load, save } from '../../lib/storage';
import { haptic } from '../../lib/perf';
import { answer, CARD_WIDTH_MM, optotypePx, resultLogMar, snellen6, startStaircase, type Direction, type StaircaseState } from '../../tests/vision';
import { useScan } from '../../state/scan';
import { Button, LinkButton } from '../../ui/Button';
import { Dock } from '../../ui/Layout';
import { spring } from '../../ui/motion';
import type { StepProps } from './ScanStep';

const DISTANCE_MM = 400;
const ROTATION: Record<Direction, number> = { right: 0, down: 90, left: 180, up: 270 };
/** Smallest E we can draw sharply: 5 device pixels tall (one per stroke row). */
const MIN_DEVICE_PX = 5;

function TumblingE({ size, dir }: { size: number; dir: Direction }) {
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" style={{ transform: `rotate(${ROTATION[dir]}deg)`, shapeRendering: 'crispEdges' }} aria-hidden>
      <rect x="0" y="0" width="1" height="5" fill="currentColor" />
      <rect x="0" y="0" width="5" height="1" fill="currentColor" />
      <rect x="0" y="2" width="5" height="1" fill="currentColor" />
      <rect x="0" y="4" width="5" height="1" fill="currentColor" />
    </svg>
  );
}

type Phase = 'calibrate' | 'right' | 'left' | 'result';

export default function VisionTest({ next }: StepProps) {
  const { t } = useTranslation();
  const { record, skip } = useScan();
  const [cardPx, setCardPx] = useState(() => load<number>('niktan.cardPx', 324));
  const [phase, setPhase] = useState<Phase>('calibrate');
  const [stair, setStair] = useState<StaircaseState>(() => startStaircase());
  const [results, setResults] = useState<{ right: number | null; left: number | null }>({ right: null, left: null });
  const [shake, setShake] = useState(0);
  const pxPerMm = cardPx / CARD_WIDTH_MM;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const size = optotypePx(stair.logMar, DISTANCE_MM, pxPerMm);

  const finishEye = (eye: 'right' | 'left', s: StaircaseState) => {
    const value = resultLogMar(s);
    const nextResults = { ...results, [eye]: value };
    setResults(nextResults);
    haptic([20, 40, 20]);
    if (eye === 'right') {
      setStair(startStaircase());
      setPhase('left');
    } else {
      setPhase('result');
      record('vision', { rightLogMar: nextResults.right, leftLogMar: nextResults.left });
    }
  };

  const respond = (d: Direction | 'unsure') => {
    if (phase !== 'right' && phase !== 'left') return;
    const correct = d === stair.current;
    haptic(correct ? 10 : [10, 30, 10]);
    if (!correct) setShake((n) => n + 1);
    let s = answer(stair, d);
    // Stop once the next level would be too small for this screen to draw sharply.
    if (!s.done && optotypePx(s.logMar, DISTANCE_MM, pxPerMm) * dpr < MIN_DEVICE_PX) s = { ...s, done: true };
    if (s.done) finishEye(phase, s);
    else setStair(s);
  };

  const onSwipe = (_: unknown, info: PanInfo) => {
    const { x, y } = info.offset;
    if (Math.max(Math.abs(x), Math.abs(y)) < 40) return;
    respond(Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up');
  };

  const refer = useMemo(() => visionNeedsReferral({ rightLogMar: results.right, leftLogMar: results.left }), [results]);

  if (phase === 'calibrate') {
    return (
      <div className="flex flex-1 flex-col pt-6">
        <div className="flex items-center gap-3">
          <CreditCard className="text-accent-text" size={24} strokeWidth={1.75} aria-hidden />
          <h2 className="text-title-2 font-semibold">{t('vision.title')}</h2>
        </div>
        <p className="mt-3 text-body-lg text-text-2">{t('vision.calibrate')}</p>
        <div className="mt-8 flex justify-center">
          <motion.div layout className="rounded-[3.18mm] border-2 border-dashed border-accent bg-accent-soft" style={{ width: cardPx, height: cardPx * (53.98 / 85.6) }} transition={spring.layout} />
        </div>
        <input
          type="range"
          min={200}
          max={Math.min(480, window.innerWidth - 24)}
          step={1}
          value={cardPx}
          onChange={(e) => setCardPx(Number(e.target.value))}
          className="mt-8 w-full accent-[var(--accent)]"
          aria-label={t('vision.calibrate')}
        />
        <p className="mt-6 text-body text-text-3">{t('vision.distance')}</p>
        <Dock>
          <Button
            onClick={() => {
              save('niktan.cardPx', cardPx);
              setPhase('right');
            }}
          >
            {t('common.continue')}
          </Button>
          <LinkButton
            onClick={() => {
              skip('vision');
              next();
            }}
          >
            {t('common.skip')}
          </LinkButton>
        </Dock>
      </div>
    );
  }

  if (phase === 'result') {
    const row = (label: string, v: number | null) => (
      <div className="flex items-center justify-between rounded-lg bg-surface px-4 py-4 shadow-1">
        <span className="text-body-lg">{label}</span>
        <span className="tnum text-title-2 font-semibold">{v === null ? '—' : snellen6(v)}</span>
      </div>
    );
    return (
      <div className="flex flex-1 flex-col gap-3 pt-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.reveal} className="flex flex-col gap-3">
          {row(t('vision.right'), results.right)}
          {row(t('vision.left'), results.left)}
          <p className={`mt-2 rounded-md px-4 py-3 text-body ${refer ? 'bg-seetoday-tint text-seetoday-ink' : 'bg-routine-tint text-routine-ink'}`}>
            {refer ? t('card.refer') + ' · ' + t('steps.vision') : t('eye.normal')}
          </p>
          <p className="text-caption text-text-3">{t('app.notDiagnosis')}</p>
        </motion.div>
        <Dock>
          <Button onClick={next}>{t('common.next')}</Button>
        </Dock>
      </div>
    );
  }

  const arrows: { d: Direction; icon: typeof ArrowUp; cls: string }[] = [
    { d: 'up', icon: ArrowUp, cls: 'col-start-2 row-start-1' },
    { d: 'left', icon: ArrowLeft, cls: 'col-start-1 row-start-2' },
    { d: 'right', icon: ArrowRight, cls: 'col-start-3 row-start-2' },
    { d: 'down', icon: ArrowDown, cls: 'col-start-2 row-start-3' },
  ];

  return (
    <div className="flex flex-1 flex-col pt-4">
      <AnimatePresence mode="wait">
        <motion.div key={phase} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 rounded-md bg-accent-soft px-4 py-2.5 text-body-lg font-medium text-accent-soft-ink">
          <Glasses size={20} aria-hidden /> {phase === 'right' ? t('vision.coverLeft') : t('vision.coverRight')}
        </motion.div>
      </AnimatePresence>
      <motion.div className="relative mt-4 flex h-[34vh] min-h-48 items-center justify-center rounded-xl bg-white text-black shadow-1" drag dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} dragElastic={0.15} onDragEnd={onSwipe} style={{ touchAction: 'none' }}>
        <motion.div key={`${stair.logMar}-${stair.shown}-${shake}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1, x: shake && stair.shown ? [0, -4, 4, 0] : 0 }} transition={{ duration: 0.18 }}>
          <TumblingE size={size} dir={stair.current} />
        </motion.div>
        <span className="tnum absolute right-3 bottom-2 text-caption text-black/40">{snellen6(stair.logMar)}</span>
      </motion.div>
      <p className="mt-3 text-center text-body text-text-2">{t('vision.instruction')}</p>
      <div className="mx-auto mt-3 grid grid-cols-3 grid-rows-3 gap-2">
        {arrows.map(({ d, icon: Icon, cls }) => (
          <motion.button key={d} whileTap={{ scale: 0.9 }} transition={spring.tap} onClick={() => respond(d)} aria-label={d} className={`flex size-[72px] items-center justify-center rounded-lg bg-surface shadow-2 ${cls}`}>
            <Icon size={30} strokeWidth={1.75} />
          </motion.button>
        ))}
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => respond('unsure')} className="col-start-2 row-start-2 flex size-[72px] flex-col items-center justify-center rounded-lg bg-sunken text-caption text-text-2">
          <EyeOff size={20} aria-hidden />
          <span className="mt-0.5 leading-tight">{t('vision.unsure')}</span>
        </motion.button>
      </div>
    </div>
  );
}
