import { AnimatePresence, motion } from 'motion/react';
import { Delete, Ear, Headphones, Play, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DinPlayer } from '../../audio/dinPlayer';
import { haptic } from '../../lib/perf';
import { DIN, dinResult, respond, startDin, type DinState } from '../../tests/din';
import { useScan } from '../../state/scan';
import { Button, LinkButton } from '../../ui/Button';
import { Dock } from '../../ui/Layout';
import { spring } from '../../ui/motion';
import type { StepProps } from './ScanStep';

type Phase = 'intro' | 'check' | 'test' | 'result' | 'missing';

export default function HearingTest({ next, guide }: StepProps) {
  const { t } = useTranslation();
  const { record, skip, profile } = useScan();
  const player = useRef<DinPlayer | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [loading, setLoading] = useState(false);
  const [din, setDin] = useState<DinState>(() => startDin());
  const [typed, setTyped] = useState('');
  const [playing, setPlaying] = useState(false);
  const [checked, setChecked] = useState({ left: false, right: false });
  const [practised, setPractised] = useState(false);
  const [earsConfirmed, setEarsConfirmed] = useState(false);
  const result = phase === 'result' ? dinResult(din) : null;

  useEffect(() => {
    const stop = () => {
      player.current?.close();
      player.current = null;
    };
    const onHide = () => {
      if (document.hidden && player.current) {
        stop();
        setPhase('missing');
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      stop();
    };
  }, []);

  const begin = async () => {
    setLoading(true);
    try {
      const audio = new DinPlayer();
      player.current = audio;
      await audio.resume();
      const ok = await audio.load('hi');
      if (player.current === audio) {
        if (!ok) {
          audio.close();
          player.current = null;
        }
        setPhase(ok ? 'check' : 'missing');
      }
    } catch {
      setPhase('missing');
    } finally {
      setLoading(false);
    }
  };

  const play = async (digits: string, snr: number) => {
    const audio = player.current;
    if (!audio) return false;
    setPlaying(true);
    setTyped('');
    try {
      await audio.resume();
      await audio.playTriplet(digits, snr);
      return player.current === audio;
    } catch {
      if (player.current === audio) {
        audio.close();
        player.current = null;
        setPhase('missing');
      }
      return false;
    } finally {
      if (player.current === audio) setPlaying(false);
    }
  };

  const submit = async (digits: string) => {
    const s = respond(din, digits);
    setDin(s);
    haptic(10);
    if (s.done) {
      const r = dinResult(s)!;
      player.current?.close();
      player.current = null;
      setPhase('result');
      record('hearing', r);
      return;
    }
    await play(s.current, s.snr);
  };

  const press = (d: string) => {
    if (playing || typed.length >= 3) return;
    const v = typed + d;
    setTyped(v);
  };

  const skipStep = () => {
    skip('hearing');
    next();
  };

  const tooYoung = !!profile && profile.age < 18;
  if (phase === 'missing' || tooYoung) {
    return (
      <div className="flex flex-1 flex-col pt-10 text-center">
        <Headphones className="mx-auto text-text-3" size={44} strokeWidth={1.25} aria-hidden />
        <p className="mx-auto mt-4 max-w-xs text-body-lg text-text-2">{t(tooYoung ? 'hearing.adults' : 'hearing.missing')}</p>
        <Dock>
          <Button onClick={skipStep}>{t('common.skip')}</Button>
        </Dock>
      </div>
    );
  }

  if (phase === 'intro' || phase === 'check') {
    return (
      <div className="flex flex-1 flex-col pt-6">
        {phase === 'intro' && !loading && <div className="mb-3">{guide}</div>}
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.reveal} className="mx-auto flex size-24 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
          <Headphones size={44} strokeWidth={1.25} aria-hidden />
        </motion.div>
        <h2 className="mt-6 text-center text-title-2 font-semibold">{t('hearing.title')}</h2>
        <p className="mt-2 text-center text-body-lg text-text-2">{phase === 'intro' ? t('hearing.earphones') : t('hearing.leftRight')}</p>
        <p className="mt-2 text-center text-body text-text-3">{t('hearing.experimental')}</p>
        {phase === 'check' && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {(['left', 'right'] as const).map((side) => (
              <motion.button key={side} whileTap={{ scale: 0.95 }} disabled={playing} aria-pressed={checked[side]} onClick={() => {
                try {
                  player.current?.tone(side);
                  setChecked((old) => ({ ...old, [side]: true }));
                } catch {
                  setPhase('missing');
                }
              }} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg bg-surface shadow-1">
                <Ear size={26} strokeWidth={1.5} className={side === 'left' ? '-scale-x-100' : ''} aria-hidden />
                <span className="text-body">{t(`hearing.${side}`)}</span>
              </motion.button>
            ))}
          </div>
        )}
        {phase === 'check' && (
          <label className="mt-4 flex min-h-11 items-center gap-3">
            <input type="checkbox" disabled={!checked.left || !checked.right} checked={earsConfirmed} onChange={(event) => setEarsConfirmed(event.target.checked)} />
            {t('hearing.confirmEars')}
          </label>
        )}
        {phase === 'check' && <p className="my-4 text-center text-body text-text-3">{t('hearing.instruction')}</p>}
        {phase === 'check' && (
          <Button variant="secondary" disabled={playing || !earsConfirmed}
            onClick={async () => setPractised(await play('123', 5))}>
            {t('hearing.practice')}
          </Button>
        )}
        <Dock>
          {phase === 'intro' ? (
            <Button icon={Headphones} loading={loading} onClick={begin}>
              {t('common.continue')}
            </Button>
          ) : (
            <Button
              icon={Play}
              disabled={!practised || playing || !earsConfirmed}
              onClick={async () => {
                const s = startDin();
                setDin(s);
                setPhase('test');
                await play(s.current, s.snr);
              }}
            >
              {t('hearing.start')}
            </Button>
          )}
          <LinkButton onClick={skipStep}>{t('hearing.noEarphones')}</LinkButton>
        </Dock>
      </div>
    );
  }

  if (phase === 'result' && result) {
    const pass = result.result === 'pass';
    return (
      <div className="flex flex-1 flex-col pt-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.reveal} className="flex flex-col items-center gap-3 text-center">
          <span className={`flex size-20 items-center justify-center rounded-full ${pass ? 'bg-routine-tint text-routine-ink' : 'bg-seetoday-tint text-seetoday-ink'}`}>
            <Ear size={36} strokeWidth={1.5} aria-hidden />
          </span>
          <p className="text-title-2 font-semibold">{pass ? t('hearing.pass') : t('hearing.refer')}</p>
          <p className="text-body text-text-2">{t('hearing.experimental')}</p>
          <p className="tnum text-body text-text-3">SRT {result.srtDb} dB SNR</p>
        </motion.div>
        <Dock>
          <Button onClick={next}>{t('common.next')}</Button>
        </Dock>
      </div>
    );
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'submit'];
  return (
    <div className="flex flex-1 flex-col pt-4">
      <div className="flex items-center justify-between text-caption text-text-3">
        <span className="tnum">{t('hearing.progress', { n: Math.min(din.index + 1, DIN.triplets), total: DIN.triplets })}</span>
        <AnimatePresence>
          {playing && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-accent-text">
              <Volume2 size={16} aria-hidden /> …
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
        <motion.div className="h-full origin-left bg-accent" animate={{ scaleX: din.index / DIN.triplets }} transition={spring.reveal} />
      </div>
      <div className="mt-8 flex justify-center gap-3" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className={`tnum flex h-16 w-14 items-center justify-center rounded-md text-title-1 font-semibold ${typed[i] ? 'bg-accent-soft text-accent-soft-ink' : 'bg-sunken'}`} animate={{ scale: typed.length === i + 1 ? [1, 1.08, 1] : 1 }} transition={{ duration: 0.2 }}>
            {typed[i] ?? ''}
          </motion.div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-3 gap-2.5">
        {keys.map((k) => (
          <motion.button
            key={k}
            whileTap={{ scale: 0.92 }}
            transition={spring.tap}
            disabled={playing || (k === 'submit' && typed.length !== 3)}
            onClick={() => (k === 'del' ? setTyped((v) => v.slice(0, -1)) : k === 'submit' ? void submit(typed) : press(k))}
            aria-label={k === 'del' ? t('hearing.delete') : k === 'submit' ? t('common.next') : k}
            className="tnum flex h-16 items-center justify-center rounded-md bg-surface text-title-1 font-medium shadow-1 disabled:opacity-50"
          >
            {k === 'del' ? <Delete size={24} aria-hidden /> : k === 'submit' ? <Play size={22} aria-hidden /> : k}
          </motion.button>
        ))}
      </div>
      <Button variant="secondary" className="mt-4" disabled={playing} onClick={() => void submit('')}>
        {t('hearing.unable')}
      </Button>
      <LinkButton onClick={skipStep}>{t('common.skip')}</LinkButton>
    </div>
  );
}
