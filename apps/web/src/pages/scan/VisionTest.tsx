import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CreditCard, EyeOff, Glasses } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { visionNeedsReferral } from '@niktan/core';
import { load, save } from '../../lib/storage';
import { haptic } from '../../lib/perf';
import { answer, CARD_SHORT_EDGE_MM, screenOptotype, resultLogMar, snellen6, startStaircase, type Direction, type StaircaseState } from '../../tests/vision';
import { useScan } from '../../state/scan';
import { Button, LinkButton } from '../../ui/Button';
import { Dock } from '../../ui/Layout';
import { spring } from '../../ui/motion';
import { AstigmatismStep, ColourStep, ContrastStep, GlareStep, VisionSteps } from './VisionExtras';
import type { ColourResult } from '../../tests/colorVision';
import { REDUCED_BELOW } from '../../tests/contrast';
import type { Vision } from '@niktan/core';
import type { StepProps } from './ScanStep';


const ROTATION: Record<Direction, number> = { right: 0, down: 90, left: 180, up: 270 };


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

/** Below this the plain contrast score is already so low that a drop under glare could not show. */
const GLARE_MIN_LOGCS = 0.9;

type Phase = 'calibrate' | 'right' | 'left' | 'dial-right' | 'dial-left' | 'contrast' | 'glare' | 'colour' | 'result';

export default function VisionTest({ next, guide }: StepProps) {
  const { t } = useTranslation();
  const { record, skip, profile } = useScan();
  /** The glare test is for the ages where cataract is common. */
  const glareTest = (profile?.age ?? 0) >= 40;
  const dpr = window.devicePixelRatio || 1;
  const calibrationKey = `niktan.cardShort.${screen.width}x${screen.height}.${dpr}`;
  const maxCardPx = Math.min(420, window.innerWidth - 56);
  const [cardPx, setCardPx] = useState(() => Math.max(100, Math.min(maxCardPx, load<number>(calibrationKey, 204) || 204)));
  const [distanceMm, setDistanceMm] = useState<400 | 2000>(2000);
  const [phase, setPhase] = useState<Phase>('calibrate');
  const [stair, setStair] = useState<StaircaseState>(() => startStaircase());
  const [results, setResults] = useState<{ right: number | null; left: number | null }>({ right: null, left: null });
  const [astig, setAstig] = useState<{ right: boolean | null; left: boolean | null } | null>(null);
  const [contrast, setContrast] = useState<number | null>(null);
  const [glare, setGlare] = useState<number | null>(null);
  const [colour, setColour] = useState<ColourResult | null>(null);
  const pxPerMm = cardPx / CARD_SHORT_EDGE_MM;
  const optotype = screenOptotype(stair.logMar, distanceMm, pxPerMm, dpr);
  const skipStep = () => {
    skip('vision');
    next();
  };

  const finishEye = (eye: 'right' | 'left', s: StaircaseState) => {
    const value = resultLogMar(s);
    const nextResults = { ...results, [eye]: value };
    setResults(nextResults);
    haptic([20, 40, 20]);
    if (eye === 'right') {
      setStair(startStaircase());
      setPhase('left');
    } else {
      setPhase('dial-right');
    }
  };

  /** Saves acuity plus whichever extra checks were done; skipped ones stay null. */
  const finish = (extras: Pick<Vision, 'astigmatism' | 'contrastLogCs' | 'colour'>) => {
    record('vision', { distanceMm, rightLogMar: results.right, leftLogMar: results.left, ...extras, glareLogCs: extras.contrastLogCs != null ? glare : null });
    haptic([20, 40, 20]);
    setPhase('result');
  };

  const respond = (d: Direction | 'unsure') => {
    if (phase !== 'right' && phase !== 'left') return;
    haptic(10);
    let s = answer(stair, d);
    if (!s.done && s.logMar !== stair.logMar) {
      // A coarse screen can impose a floor. Only score lines that were actually visible.
      while (!screenOptotype(s.logMar, distanceMm, pxPerMm, dpr).readable && s.ascending && s.logMar < 1) {
        s = { ...s, logMar: Math.round((s.logMar + 0.1) * 10) / 10 };
      }
      if (!screenOptotype(s.logMar, distanceMm, pxPerMm, dpr).readable) s = { ...s, done: true };
    }
    if (s.done) finishEye(phase, s);
    else setStair(s);
  };

  useEffect(() => {
    if (phase !== 'right' && phase !== 'left') return;
    const directions: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const onKey = (event: KeyboardEvent) => {
      const dir = directions[event.key];
      if (!dir || event.repeat || event.altKey || event.metaKey || event.ctrlKey || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      respond(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const onSwipe = (_: unknown, info: PanInfo) => {
    const { x, y } = info.offset;
    if (Math.max(Math.abs(x), Math.abs(y)) < 40) return;
    respond(Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up');
  };

  const refer = visionNeedsReferral({ distanceMm, rightLogMar: results.right, leftLogMar: results.left });
  const extraFlag = !!(astig?.right || astig?.left || colour?.flag || (contrast !== null && contrast < REDUCED_BELOW));

  if (phase === 'calibrate') {
    return (
      <div className="flex flex-1 flex-col pt-6">
        <div className="mb-3">{guide}</div>
        <div className="flex items-center gap-3">
          <CreditCard className="text-accent-text" size={24} strokeWidth={1.75} aria-hidden />
          <h2 className="text-title-2 font-semibold">{t('vision.title')}</h2>
        </div>
        <p className="mt-3 text-body-lg text-text-2">{t('vision.calibrate')}</p>
        <div className="mt-5 flex justify-center">
          <div className="h-9 shrink-0 rounded-sm border-x-2 border-b-2 border-dashed border-accent bg-accent-soft" style={{ width: cardPx }} />
        </div>
        <input
          type="range"
          min={100}
          max={maxCardPx}
          step={1}
          value={cardPx}
          onChange={(e) => setCardPx(Number(e.target.value))}
          className="mt-8 w-full accent-[var(--accent)]"
          aria-label={t('vision.calibrate')}
        />
        <fieldset className="mt-6">
          <legend className="mb-2 text-label text-text-2">{t('vision.mode')}</legend>
          {/* A segmented choice: each option is a full-width card, so long labels never wrap mid-word. */}
          <div className="grid grid-cols-2 gap-2">
            {([2000, 400] as const).map((mm) => (
              <label key={mm} className={`flex min-h-14 cursor-pointer items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-body ring-1 transition-colors ${distanceMm === mm ? 'bg-white/10 ring-white/40' : 'bg-white/[0.04] ring-white/10'}`}>
                <input type="radio" name="distance" className="size-4 shrink-0 accent-white" checked={distanceMm === mm} onChange={() => setDistanceMm(mm)} />
                <span className="leading-snug">{t(mm === 2000 ? 'vision.far' : 'vision.near')}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-3 text-body text-text-2">{t(distanceMm === 2000 ? 'vision.helper' : 'vision.distance')}</p>
        {!optotype.readable && <p className="mt-2 text-body">{t('vision.resolution')}</p>}
        <Dock>
          <Button
            disabled={!optotype.readable}
            onClick={() => {
              save(calibrationKey, cardPx);
              setPhase('right');
            }}
          >
            {t('common.continue')}
          </Button>
          <LinkButton onClick={skipStep}>
            {t('common.skip')}
          </LinkButton>
        </Dock>
      </div>
    );
  }

  if (phase === 'dial-right' || phase === 'dial-left' || phase === 'contrast' || phase === 'glare' || phase === 'colour') {
    const step = phase === 'contrast' || phase === 'glare' ? 2 : phase === 'colour' ? 3 : 1;
    return (
      <div className="flex flex-1 flex-col gap-4 pt-6 pb-6">
        <VisionSteps active={step} />
        <AnimatePresence mode="wait">
          {phase === 'dial-right' && (
            <AstigmatismStep key="dr" eye="right" onSkip={() => { setAstig(null); setPhase('contrast'); }}
              onAnswer={(v) => { setAstig({ right: v, left: null }); setPhase('dial-left'); }} />
          )}
          {phase === 'dial-left' && (
            <AstigmatismStep key="dl" eye="left" onSkip={() => setPhase('contrast')}
              onAnswer={(v) => { setAstig((a) => ({ right: a?.right ?? null, left: v })); setPhase('contrast'); }} />
          )}
          {phase === 'contrast' && (
            <ContrastStep key="c" pxPerMm={pxPerMm} onSkip={() => setPhase('colour')} onDone={(v) => { setContrast(v); setGlare(null); setPhase(glareTest && v >= GLARE_MIN_LOGCS ? 'glare' : 'colour'); }} />
          )}
          {phase === 'glare' && (
            <GlareStep key="g" pxPerMm={pxPerMm} onSkip={() => setPhase('colour')} onDone={(v) => { setGlare(v); setPhase('colour'); }} />
          )}
          {phase === 'colour' && (
            <ColourStep key="col" onSkip={() => finish({ astigmatism: astig, contrastLogCs: contrast, colour: null })}
              onDone={(r) => { setColour(r); finish({ astigmatism: astig, contrastLogCs: contrast, colour: r }); }} />
          )}
        </AnimatePresence>
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
          <h2 className="text-title-2 font-semibold">{t(distanceMm === 2000 ? 'vision.far' : 'vision.near')}</h2>
          {row(t('vision.right'), results.right)}
          {row(t('vision.left'), results.left)}
          {[
            { label: t('vision.stepDial'), value: !astig || (astig.right === null && astig.left === null) ? '—' : astig.right || astig.left ? t('vision.dialFlag') : t('vision.dialOk'), warn: !!(astig?.right || astig?.left) },
            { label: t('vision.stepContrast'), value: contrast === null ? '—' : `${contrast.toFixed(2)} logCS · ${contrast < REDUCED_BELOW ? t('vision.contrastLow') : t('vision.contrastOk')}`, warn: contrast !== null && contrast < REDUCED_BELOW },
            ...(glare !== null && contrast !== null ? [{ label: t('vision.glare'), value: `${glare.toFixed(2)} logCS · ${contrast - glare >= 0.3 - 1e-9 ? t('vision.glareDrop', { n: (contrast - glare).toFixed(2) }) : t('vision.glareOk')}`, warn: contrast - glare >= 0.3 - 1e-9 }] : []),
            { label: t('vision.stepColour'), value: !colour ? '—' : colour.flag === null ? t('vision.colourVoid') : `${colour.correct}/${colour.total} · ${colour.flag ? t('vision.colourFlag') : t('vision.colourOk')}`, warn: !!colour?.flag },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4 rounded-lg bg-surface px-4 py-3.5 shadow-1">
              <span className="text-body-lg">{r.label}</span>
              <span className={`text-right text-body font-medium ${r.warn ? 'text-seetoday-text' : 'text-text-2'}`}>{r.value}</span>
            </div>
          ))}
          <p className={`mt-2 rounded-md px-4 py-3 text-body ${refer || extraFlag ? 'bg-seetoday-tint text-seetoday-ink' : 'bg-routine-tint text-routine-ink'}`}>
            {refer ? (distanceMm === 400 ? t('vision.nearRefer') : t('card.refer')) : extraFlag ? t('vision.extraRefer') : t('vision.pass')}
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
    <div className="flex flex-1 flex-col pt-6">
      <div className="mb-3"><VisionSteps active={0} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={phase} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="sticky top-0 z-10 flex items-center justify-center gap-2 rounded-md bg-accent-soft px-4 py-2.5 text-body-lg font-medium text-accent-soft-ink">
          <Glasses size={20} aria-hidden /> {phase === 'right' ? t('vision.coverLeft') : t('vision.coverRight')} · {distanceMm === 2000 ? '2 m' : '40 cm'}
        </motion.div>
      </AnimatePresence>
      <motion.div className="relative mt-4 flex h-[34vh] min-h-48 items-center justify-center rounded-xl bg-white text-black shadow-1" drag dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} dragElastic={0} onDragEnd={onSwipe} style={{ touchAction: 'none' }}>
        <TumblingE size={optotype.size} dir={stair.current} />
        <span className="tnum absolute right-3 bottom-2 text-caption text-black/40">{snellen6(stair.logMar)}</span>
      </motion.div>
      <p className="mt-3 text-center text-body text-text-2">{t('vision.instruction')}</p>
      <div className="mx-auto mt-3 grid grid-cols-3 grid-rows-3 gap-2">
        {arrows.map(({ d, icon: Icon, cls }) => (
          <motion.button key={d} whileTap={{ scale: 0.9 }} transition={spring.tap} onClick={() => respond(d)} aria-label={t(d === 'left' || d === 'right' ? `vision.${d}Arrow` : `vision.${d}`)} className={`flex size-[72px] items-center justify-center rounded-lg bg-surface shadow-2 ${cls}`}>
            <Icon size={30} strokeWidth={1.75} />
          </motion.button>
        ))}
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => respond('unsure')} className="col-start-2 row-start-2 flex size-[72px] flex-col items-center justify-center rounded-lg bg-sunken text-caption text-text-2">
          <EyeOff size={20} aria-hidden />
          <span className="mt-0.5 leading-tight">{t('vision.unsure')}</span>
        </motion.button>
      </div>
      <LinkButton onClick={skipStep}>{t('common.skip')}</LinkButton>
    </div>
  );
}
