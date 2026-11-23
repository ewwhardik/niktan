import { AnimatePresence, motion } from 'motion/react';
import { Ear } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { haptic } from '../../lib/perf';
import { respondTone, scoreTones, SEQUENCE, startThreshold, type EarThresholds, type ThresholdState, type ToneResult } from '../../tests/tones';
import { Button, LinkButton } from '../../ui/Button';
import { spring } from '../../ui/motion';

/** Three 220 ms pulses of a pure tone in one ear only, with 25 ms ramps so onsets don't click. */
function playTone(ctx: AudioContext, ear: 'right' | 'left', freq: number, dbfs: number): number {
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const merger = ctx.createChannelMerger(2);
  osc.connect(gain);
  gain.connect(merger, 0, ear === 'left' ? 0 : 1);
  merger.connect(ctx.destination);
  const peak = 10 ** (dbfs / 20);
  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    const on = t0 + i * 0.37;
    gain.gain.setValueAtTime(0, on);
    gain.gain.linearRampToValueAtTime(peak, on + 0.025);
    gain.gain.setValueAtTime(peak, on + 0.195);
    gain.gain.linearRampToValueAtTime(0, on + 0.22);
  }
  osc.start(t0);
  osc.stop(t0 + 1.15);
  osc.onended = () => merger.disconnect();
  return 1150;
}

type Stage = 'ready' | 'waiting' | 'tone' | 'window';

/** Tap "I heard it" whenever a beep plays; about one trial in six is silent to catch guessing. */
export function ToneStep({ onDone, onSkip }: { onDone: (r: ToneResult) => void; onSkip: () => void }) {
  const { t } = useTranslation();
  const ctx = useRef<AudioContext | null>(null);
  const [seq, setSeq] = useState(0);
  const [stage, setStage] = useState<Stage>('ready');
  const state = useRef<ThresholdState>(startThreshold());
  const results = useRef<{ right: Partial<EarThresholds>; left: Partial<EarThresholds> }>({ right: {}, left: {} });
  const catches = useRef({ trials: 0, falseYes: 0 });
  const trial = useRef<{ silent: boolean; responded: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const [pulse, setPulse] = useState(0);
  const current = SEQUENCE[seq]!;

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    void ctx.current?.close();
  }, []);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  function runTrial(index: number) {
    const step = SEQUENCE[index]!;
    // Never two silent trials in a row, and at least one per ear on average.
    const silent = trial.current?.silent ? false : Math.random() < 0.17;
    trial.current = { silent, responded: false };
    setStage('waiting');
    later(() => {
      setStage('tone');
      const ms = silent ? 1150 : playTone(ctx.current!, step.ear, step.freq, state.current.level);
      later(() => {
        setStage('window');
        later(() => settle(index), 1300);
      }, ms);
    }, 900 + Math.random() * 1400);
  }

  function settle(index: number) {
    const tr = trial.current!;
    if (tr.silent) {
      catches.current.trials++;
      if (tr.responded) catches.current.falseYes++;
      runTrial(index);
      return;
    }
    const next = respondTone(state.current, tr.responded);
    state.current = next;
    if (!next.done) {
      runTrial(index);
      return;
    }
    const step = SEQUENCE[index]!;
    results.current[step.ear][step.freq] = next.threshold;
    if (index + 1 >= SEQUENCE.length) {
      const r = results.current as { right: EarThresholds; left: EarThresholds };
      onDone(scoreTones(r.right, r.left, catches.current.trials, catches.current.falseYes));
      return;
    }
    state.current = startThreshold();
    setSeq(index + 1);
    runTrial(index + 1);
  }

  function heard() {
    if (!trial.current || trial.current.responded || stage === 'ready') return;
    haptic(10);
    setPulse((p) => p + 1);
    if (stage === 'waiting') return; // Pressing before any sound is ignored, not counted.
    trial.current.responded = true;
  }

  function start() {
    try {
      ctx.current = new AudioContext();
      void ctx.current.resume();
    } catch {
      onSkip();
      return;
    }
    runTrial(0);
  }

  const leftEar = current.ear === 'left';
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.reveal} className="flex flex-1 flex-col gap-5">
      <div className="grid grid-cols-6 gap-1" aria-hidden>
        {SEQUENCE.map((s, i) => (
          <span key={`${s.ear}${s.freq}`} className={`h-1 rounded-full ${i < seq ? 'bg-white' : i === seq && stage !== 'ready' ? 'bg-white/60' : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="text-center">
        <p className="text-title-2 font-semibold">{t(leftEar ? 'hearing.toneLeft' : 'hearing.toneRight')}</p>
        <p className="tnum mt-1 text-body text-text-3">{current.freq / 1000} kHz · {t('hearing.toneOf', { n: seq + 1, total: SEQUENCE.length })}</p>
      </div>
      <div className="relative mx-auto grid size-44 place-items-center">
        <AnimatePresence>
          {stage === 'tone' && [0, 1, 2].map((i) => (
            <motion.span key={`r${i}-${seq}`} className="absolute inset-0 rounded-full border border-white/40" initial={{ scale: 0.6, opacity: 0.7 }} animate={{ scale: 1.25, opacity: 0 }} transition={{ duration: 1.1, delay: i * 0.37, ease: 'easeOut' }} />
          ))}
        </AnimatePresence>
        <motion.span key={pulse} initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={spring.chip} className="grid size-32 place-items-center rounded-full bg-white/[0.08] ring-1 ring-white/15">
          <Ear size={52} strokeWidth={1.3} className={leftEar ? '-scale-x-100' : ''} aria-hidden />
        </motion.span>
      </div>
      <p className="text-center text-body text-text-2" aria-live="polite">{stage === 'ready' ? t('hearing.toneIntro') : t('hearing.toneListen')}</p>
      <div className="mt-auto flex flex-col gap-2">
        {stage === 'ready' ? (
          <Button onClick={start}>{t('hearing.toneStart')}</Button>
        ) : (
          <motion.button whileTap={{ scale: 0.97 }} onPointerDown={heard} className="h-24 rounded-[28px] bg-white text-title-2 font-semibold text-black">
            {t('hearing.heardIt')}
          </motion.button>
        )}
        <LinkButton onClick={onSkip}>{t('vision.skipTest')}</LinkButton>
      </div>
    </motion.div>
  );
}
