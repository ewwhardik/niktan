import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, EyeOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { haptic } from '../../lib/perf';
import { answerContrast, BAYER4, contrastScore, ditherFor, LEVELS, startContrast, type ContrastState } from '../../tests/contrast';
import { makeDots, makePlates, scoreColour, type ColourResult, type Plate } from '../../tests/colorVision';
import type { Direction } from '../../tests/vision';
import { Button, LinkButton } from '../../ui/Button';
import { spring } from '../../ui/motion';

/** Progress across the four vision checks, shown above every vision screen. */
export function VisionSteps({ active }: { active: 0 | 1 | 2 | 3 }) {
  const { t } = useTranslation();
  const labels = [t('vision.stepAcuity'), t('vision.stepDial'), t('vision.stepContrast'), t('vision.stepColour')];
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={labels[active]}>
      {labels.map((label, i) => (
        <li key={label} aria-current={i === active ? 'step' : undefined} className="flex flex-col gap-1.5">
          <span className="h-1 overflow-hidden rounded-full bg-white/10">
            <motion.span className="block h-full origin-left rounded-full bg-white" initial={false} animate={{ scaleX: i <= active ? 1 : 0 }} transition={spring.layout} />
          </span>
          <span className={`truncate text-[11px] ${i === active ? 'font-semibold text-text' : 'text-text-3'}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Four arrows around an "unsure" button; keyboard arrows work too. */
export function ArrowPad({ onAnswer }: { onAnswer: (d: Direction | 'unsure') => void }) {
  const { t } = useTranslation();
  const answer = useRef(onAnswer);
  answer.current = onAnswer;
  useEffect(() => {
    const map: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const onKey = (e: KeyboardEvent) => {
      const d = map[e.key];
      if (!d || e.repeat) return;
      e.preventDefault();
      answer.current(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const arrows = [
    { d: 'up' as const, icon: ArrowUp, cls: 'col-start-2 row-start-1' },
    { d: 'left' as const, icon: ArrowLeft, cls: 'col-start-1 row-start-2' },
    { d: 'right' as const, icon: ArrowRight, cls: 'col-start-3 row-start-2' },
    { d: 'down' as const, icon: ArrowDown, cls: 'col-start-2 row-start-3' },
  ];
  return (
    <div className="mx-auto grid grid-cols-3 grid-rows-3 gap-2">
      {arrows.map(({ d, icon: Icon, cls }) => (
        <motion.button key={d} whileTap={{ scale: 0.9 }} transition={spring.tap} onClick={() => onAnswer(d)} aria-label={t(d === 'left' || d === 'right' ? `vision.${d}Arrow` : `vision.${d}`)}
          className={`flex size-16 items-center justify-center rounded-2xl bg-white/[0.08] ring-1 ring-white/10 sm:size-[72px] ${cls}`}>
          <Icon size={28} strokeWidth={1.75} />
        </motion.button>
      ))}
      <motion.button whileTap={{ scale: 0.9 }} onClick={() => onAnswer('unsure')} className="col-start-2 row-start-2 flex size-16 flex-col items-center justify-center rounded-2xl bg-white/[0.04] text-caption text-text-2 sm:size-[72px]">
        <EyeOff size={18} aria-hidden />
        <span className="mt-0.5 leading-tight">{t('vision.unsure')}</span>
      </motion.button>
    </div>
  );
}

/** Clock dial of line triplets every 30°. With astigmatism some meridians look darker or sharper. */
function Dial({ size }: { size: number }) {
  const spokes = Array.from({ length: 6 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="-100 -100 200 200" aria-hidden>
      {spokes.map((deg) => (
        <g key={deg} transform={`rotate(${deg})`}>
          {[-5, 0, 5].map((o) => <line key={o} x1={o} y1={-92} x2={o} y2={-28} stroke="#000" strokeWidth="2.2" />)}
          {[-5, 0, 5].map((o) => <line key={`b${o}`} x1={o} y1={28} x2={o} y2={92} stroke="#000" strokeWidth="2.2" />)}
        </g>
      ))}
      <circle r="6" fill="#000" />
    </svg>
  );
}

export function AstigmatismStep({ eye, onAnswer, onSkip }: { eye: 'right' | 'left'; onAnswer: (uneven: boolean | null) => void; onSkip: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div key={eye} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={spring.reveal} className="flex flex-1 flex-col gap-4">
      <p className="rounded-2xl bg-white/[0.08] px-4 py-2.5 text-center text-body-lg font-medium">{eye === 'right' ? t('vision.coverLeft') : t('vision.coverRight')}</p>
      <div className="flex items-center justify-center rounded-[28px] bg-white py-5 shadow-2">
        <Dial size={Math.min(260, window.innerWidth - 96)} />
      </div>
      <p className="text-center text-body-lg">{t('vision.dialQuestion')}</p>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onAnswer(false)}>{t('vision.dialSame')}</Button>
        <Button variant="secondary" onClick={() => onAnswer(true)}>{t('vision.dialUneven')}</Button>
      </div>
      <div className="flex justify-center gap-2">
        <LinkButton onClick={() => onAnswer(null)}>{t('vision.notSure')}</LinkButton>
        <LinkButton onClick={onSkip}>{t('vision.skipTest')}</LinkButton>
      </div>
    </motion.div>
  );
}

/** A tumbling E drawn pixel by pixel with Bayer dithering so its contrast is physically exact. */
function DitheredE({ cssSize, logCs, dir }: { cssSize: number; logCs: number; dir: Direction }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const n = Math.max(20, Math.round(cssSize * dpr));
    canvas.width = n;
    canvas.height = n;
    const { lo, hi, frac } = ditherFor(logCs);
    const img = ctx.createImageData(n, n);
    const cell = n / 5;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // E opening to the right in a 5×5 grid, then rotated by swapping coordinates.
        let gx = Math.floor(x / cell);
        let gy = Math.floor(y / cell);
        if (dir === 'down') [gx, gy] = [gy, 4 - gx];
        else if (dir === 'left') [gx, gy] = [4 - gx, 4 - gy];
        else if (dir === 'up') [gx, gy] = [4 - gy, gx];
        const ink = gx === 0 || gy === 0 || gy === 2 || gy === 4;
        const v = ink ? (BAYER4[(y % 4) * 4 + (x % 4)]! < frac ? hi : lo) : 255;
        const k = (y * n + x) * 4;
        img.data[k] = v;
        img.data[k + 1] = v;
        img.data[k + 2] = v;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [cssSize, logCs, dir]);
  return <canvas ref={ref} style={{ width: cssSize, height: cssSize, imageRendering: 'pixelated' }} aria-hidden />;
}

export function ContrastStep({ pxPerMm, onDone, onSkip }: { pxPerMm: number; onDone: (logCs: number) => void; onSkip: () => void }) {
  const { t } = useTranslation();
  const [s, setS] = useState<ContrastState>(() => startContrast());
  // Pelli-Robson letters subtend about 2.8° at 1 m; at an arm's length of 40 cm that is ~20 mm.
  const cssSize = Math.min(window.innerWidth - 96, Math.max(64, 20 * pxPerMm));
  const respond = (d: Direction | 'unsure') => {
    haptic(10);
    const next = answerContrast(s, d);
    if (next.done) onDone(contrastScore(next));
    else setS(next);
  };
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={spring.reveal} className="flex flex-1 flex-col gap-4">
      <p className="rounded-2xl bg-white/[0.08] px-4 py-2.5 text-center text-body-lg font-medium">{t('vision.contrastBanner')}</p>
      <div className="relative flex h-[30svh] min-h-44 items-center justify-center rounded-[28px] bg-white shadow-2">
        <AnimatePresence mode="wait">
          <motion.div key={`${s.level}-${s.shown}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <DitheredE cssSize={cssSize} logCs={LEVELS[s.level]!} dir={s.current} />
          </motion.div>
        </AnimatePresence>
        <span className="tnum absolute right-3 bottom-2 text-caption text-black/35">{Math.round(10 ** -LEVELS[s.level]! * 1000) / 10}%</span>
      </div>
      <p className="text-center text-body text-text-2">{t('vision.instruction')}</p>
      <ArrowPad onAnswer={respond} />
      <LinkButton onClick={onSkip}>{t('vision.skipTest')}</LinkButton>
    </motion.div>
  );
}

/** Renders a plate: digit mask from an off-screen canvas, then dots coloured by the mask. */
function PlateCanvas({ plate, size }: { plate: Plate; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dots = useMemo(() => {
    const mask = document.createElement('canvas');
    mask.width = size;
    mask.height = size;
    const m = mask.getContext('2d', { willReadFrequently: true })!;
    m.fillStyle = '#000';
    m.textAlign = 'center';
    m.textBaseline = 'middle';
    m.font = `900 ${Math.round(size * 0.74)}px system-ui, -apple-system, sans-serif`;
    m.fillText(String(plate.digit), size / 2, size / 2 + size * 0.03);
    const data = m.getImageData(0, 0, size, size).data;
    return makeDots(plate, size, (x, y) => data[(Math.floor(y) * size + Math.floor(x)) * 4 + 3]! > 128);
  }, [plate, size]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    for (const d of dots) {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [dots, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-full" aria-hidden />;
}

export function ColourStep({ onDone, onSkip }: { onDone: (r: ColourResult) => void; onSkip: () => void }) {
  const { t } = useTranslation();
  const plates = useMemo(() => makePlates(), []);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const size = Math.min(280, window.innerWidth - 80);
  const plate = plates[index]!;
  const choose = (value: number | null) => {
    haptic(10);
    const next = [...answers, value];
    if (next.length === plates.length) onDone(scoreColour(plates, next));
    else {
      setAnswers(next);
      setIndex(index + 1);
    }
  };
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={spring.reveal} className="flex flex-1 flex-col gap-4">
      <p className="rounded-2xl bg-white/[0.08] px-4 py-2.5 text-center text-body-lg font-medium">{t('vision.colourBanner', { n: index + 1, total: plates.length })}</p>
      <div className="flex items-center justify-center rounded-[28px] bg-[#f2f0ea] py-5 shadow-2">
        <AnimatePresence mode="wait">
          <motion.div key={index} initial={{ opacity: 0, rotate: -8, scale: 0.92 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.reveal}>
            <PlateCanvas plate={plate} size={size} />
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="text-center text-body-lg">{t('vision.colourQuestion')}</p>
      <div className="grid grid-cols-4 gap-2">
        {plate.options.map((o) => (
          <motion.button key={o} whileTap={{ scale: 0.92 }} onClick={() => choose(o)} className="tnum h-14 rounded-2xl bg-white/[0.08] text-title-2 font-semibold ring-1 ring-white/10">{o}</motion.button>
        ))}
      </div>
      <Button variant="secondary" onClick={() => choose(null)}>{t('vision.noNumber')}</Button>
      <LinkButton onClick={onSkip}>{t('vision.skipTest')}</LinkButton>
    </motion.div>
  );
}
