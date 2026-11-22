import { AnimatePresence, motion } from 'motion/react';
import { Camera, Hand, HeartPulse, RefreshCw, Sun, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCamera } from '../../cv/camera';
import { faceGeometry, loadFaceLandmarker, sampleSkin } from '../../cv/face';
import { estimate, type RgbSample } from '../../cv/rppg';
import { haptic } from '../../lib/perf';
import { useScan } from '../../state/scan';
import { Button, LinkButton } from '../../ui/Button';
import { Dock } from '../../ui/Layout';
import { CountUp } from '../../ui/Numbers';
import { ScanRing } from '../../ui/ScanRing';
import { Waveform } from '../../ui/Waveform';
import { spring } from '../../ui/motion';
import type { StepProps } from './ScanStep';
import { CameraProblem } from './CameraProblem';

const SCAN_SECONDS = 30;
const WARMUP_SECONDS = 2;

type Phase = 'intro' | 'loading' | 'scanning' | 'result';
type Hint = 'ok' | 'noFace' | 'manyFaces' | 'dark' | 'moving';

export default function FaceVitals({ next }: StepProps) {
  const { t } = useTranslation();
  const { record, skip } = useScan();
  const cam = useCamera('user');
  const [phase, setPhase] = useState<Phase>('intro');
  const [hint, setHint] = useState<Hint>('ok');
  const [progress, setProgress] = useState(0);
  const [liveHr, setLiveHr] = useState<number | null>(null);
  const [result, setResult] = useState<{ hr: number | null; rr: number | null; quality: number } | null>(null);
  const wave = useRef<number[]>([]);
  const samples = useRef<RgbSample[]>([]);
  const motionAcc = useRef({ sum: 0, n: 0, last: null as { cx: number; cy: number; w: number } | null });
  const loop = useRef<number>(0);
  const canvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  const stopLoop = useCallback(() => cancelAnimationFrame(loop.current), []);
  useEffect(() => stopLoop, [stopLoop]);

  const finish = useCallback(() => {
    stopLoop();
    const usable = samples.current.filter((s) => s.t >= WARMUP_SECONDS);
    const motion = motionAcc.current.n ? motionAcc.current.sum / motionAcc.current.n : 0;
    const r = estimate(usable, { motion: Math.min(1, motion * 25) });
    const res = { hr: r.heartRate ? Math.round(r.heartRate) : null, rr: r.breathingRate ? Math.round(r.breathingRate) : null, quality: Math.round(r.quality * 100) / 100 };
    setResult(res);
    setPhase('result');
    cam.stop();
    haptic([30, 60, 30]);
    if (res.hr) record('vitals', { heartRate: res.hr, breathingRate: res.rr, quality: res.quality });
  }, [cam, record, stopLoop]);

  const begin = useCallback(async () => {
    setPhase('loading');
    const ok = await cam.start();
    if (!ok) {
      setPhase('intro');
      return;
    }
    let landmarker;
    try {
      landmarker = await loadFaceLandmarker();
    } catch {
      setPhase('intro');
      return;
    }
    samples.current = [];
    wave.current = [];
    motionAcc.current = { sum: 0, n: 0, last: null };
    setLiveHr(null);
    setProgress(0);
    setPhase('scanning');
    haptic(20);

    let t0: number | null = null;
    let lastLive = 0;
    const tick = () => {
      const video = cam.videoRef.current;
      if (!video || video.readyState < 2) {
        loop.current = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      const res = landmarker.detectForVideo(video, now);
      const faces = res.faceLandmarks;
      if (faces.length !== 1) {
        setHint(faces.length > 1 ? 'manyFaces' : 'noFace');
      } else {
        const lm = faces[0]!;
        const c = canvas.current;
        const w = 192;
        c.width = w;
        c.height = Math.round((video.videoHeight / video.videoWidth) * w) || 144;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0, c.width, c.height);
        const skin = sampleSkin(ctx.getImageData(0, 0, c.width, c.height), lm);
        const geo = faceGeometry(lm);
        const m = motionAcc.current;
        let moved = 0;
        if (m.last) moved = Math.hypot(geo.cx - m.last.cx, geo.cy - m.last.cy) / Math.max(0.05, geo.width);
        m.last = { cx: geo.cx, cy: geo.cy, w: geo.width };
        if (skin) {
          t0 ??= now;
          const ts = (now - t0) / 1000;
          samples.current.push({ t: ts, r: skin.r, g: skin.g, b: skin.b });
          if (ts > WARMUP_SECONDS) {
            m.sum += moved;
            m.n++;
          }
          setHint(skin.brightness < 45 ? 'dark' : moved > 0.04 ? 'moving' : 'ok');
          setProgress(Math.min(1, ts / SCAN_SECONDS));
          if (now - lastLive > 250) {
            lastLive = now;
            const recent = samples.current.filter((s) => s.t > ts - 10 && s.t > WARMUP_SECONDS);
            const live = estimate(recent);
            if (live.pulse.length) wave.current = Array.from(live.pulse.slice(-150));
            if (ts > 10 && live.heartRate && live.quality > 0.35) setLiveHr(Math.round(live.heartRate));
          }
          if (ts >= SCAN_SECONDS) {
            finish();
            return;
          }
        } else {
          setHint('noFace');
        }
      }
      loop.current = requestAnimationFrame(tick);
    };
    loop.current = requestAnimationFrame(tick);
  }, [cam, finish]);

  const hints: Record<Hint, { text: string; icon: typeof Sun }> = {
    ok: { text: t('face.scanning'), icon: HeartPulse },
    noFace: { text: t('face.noFace'), icon: Camera },
    manyFaces: { text: t('face.noFace'), icon: Users },
    dark: { text: t('face.tooDark'), icon: Sun },
    moving: { text: t('face.moving'), icon: Hand },
  };
  const H = hints[hint];
  const remaining = Math.max(0, Math.ceil(SCAN_SECONDS * (1 - progress)));

  if (cam.status === 'error' && cam.error) {
    return <CameraProblem error={cam.error} onRetry={begin} onSkip={() => { skip('vitals'); next(); }} />;
  }

  return (
    <div className="flex flex-1 flex-col pt-5">
      <AnimatePresence mode="wait" initial={false}>
        {phase !== 'result' ? (
          <motion.div key="stage" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={spring.reveal} className="flex flex-col gap-4">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-[360px] overflow-hidden rounded-xl bg-[#111] shadow-3" style={{ touchAction: 'none' }}>
              <video ref={cam.videoRef} playsInline muted autoPlay className="absolute inset-0 size-full -scale-x-100 object-cover" />
              {phase === 'intro' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#1c1830] to-[#0e0d12] text-white">
                  <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
                    <HeartPulse size={56} strokeWidth={1.25} />
                  </motion.div>
                </div>
              )}
              {/* Oval guide with a mask so the outside dims */}
              <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <mask id="oval">
                    <rect width="300" height="400" fill="white" />
                    <ellipse cx="150" cy="185" rx="98" ry="132" fill="black" />
                  </mask>
                </defs>
                <rect width="300" height="400" fill="rgb(0 0 0 / 0.45)" mask="url(#oval)" />
                <ellipse cx="150" cy="185" rx="98" ry="132" fill="none" stroke={hint === 'ok' ? 'white' : '#F5A524'} strokeOpacity={0.9} strokeWidth="2" strokeDasharray={phase === 'scanning' ? '0' : '6 8'} />
              </svg>
              {phase !== 'intro' && (
                <ScanRing
                  state={phase === 'scanning' ? (hint === 'ok' ? 'locked' : 'issue') : 'searching'}
                  bpm={liveHr}
                  className="left-[17.33%] top-[13.25%] h-[66%] w-[65.34%]"
                />
              )}
              {phase === 'scanning' && (
                <>
                  <div className="absolute inset-x-0 top-0 h-1 bg-white/15">
                    <div className="h-full origin-left bg-white transition-transform duration-300 ease-linear" style={{ transform: `scaleX(${progress})` }} />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pt-10 pb-3 text-white">
                    <div className="flex items-end justify-between">
                      <div className="flex items-baseline gap-1.5">
                        <AnimatePresence mode="popLayout">
                          <motion.span key={liveHr ?? 'x'} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} className="tnum text-title-1 font-semibold">
                            {liveHr ?? '··'}
                          </motion.span>
                        </AnimatePresence>
                        <span className="text-caption text-white/70">{t('face.bpm')}</span>
                      </div>
                      <span className="tnum text-label text-white/80">{remaining}s</span>
                    </div>
                    <Waveform source={wave} color="#FFFFFF" height={56} />
                  </div>
                </>
              )}
            </div>
            <div aria-live="polite" className="flex min-h-12 items-center justify-center gap-2 text-center text-body-lg text-text-2">
              {phase === 'scanning' ? (
                <motion.span key={hint} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`inline-flex items-center gap-2 ${hint === 'ok' ? '' : 'font-medium text-seetoday-text'}`}>
                  <H.icon size={20} strokeWidth={1.75} aria-hidden />
                  {H.text}
                </motion.span>
              ) : (
                <span className="flex flex-col gap-1">
                  <span>{t('face.instruction')}</span>
                  <span className="text-body text-text-3">{t('face.light')}</span>
                </span>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring.reveal} className="flex flex-col items-center gap-2 pt-8 text-center">
            <span className="text-label font-medium text-text-2">{t('face.result')}</span>
            {result?.hr ? (
              <>
                <div className="flex items-baseline gap-2">
                  <CountUp value={result.hr} className="text-hero-num font-semibold tracking-tight" />
                  <span className="text-body-lg text-text-2">{t('face.bpm')}</span>
                </div>
                <motion.div className="text-emergency-text" animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 60 / result.hr, repeat: Infinity, ease: 'easeOut' }}>
                  <HeartPulse size={28} strokeWidth={1.5} aria-hidden />
                </motion.div>
                <div className="mt-6 w-full max-w-xs">
                  <div className="flex justify-between text-caption text-text-3">
                    <span>{t('face.quality')}</span>
                    <span className="tnum">{Math.round(result.quality * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
                    <motion.div className={`h-full origin-left rounded-full ${result.quality >= 0.5 ? 'bg-routine' : 'bg-seetoday'}`} initial={{ scaleX: 0 }} animate={{ scaleX: result.quality }} transition={{ ...spring.reveal, delay: 0.3 }} />
                  </div>
                </div>
                {result.rr && (
                  <p className="mt-4 text-body text-text-2">
                    {t('face.breathing')}: <span className="tnum font-semibold text-text">{result.rr}</span>/min
                  </p>
                )}
                {result.quality < 0.5 && <p className="mt-4 max-w-xs text-body text-seetoday-text">{t('face.lowQuality')}</p>}
              </>
            ) : (
              <p className="mt-4 max-w-xs text-body-lg text-text-2">{t('face.lowQuality')}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Dock>
        {phase === 'result' ? (
          <>
            <Button onClick={next}>{t('common.next')}</Button>
            <LinkButton onClick={() => setPhase('intro')} className="inline-flex items-center justify-center gap-2">
              <RefreshCw size={16} aria-hidden /> {t('common.retry')}
            </LinkButton>
          </>
        ) : phase === 'scanning' ? (
          <LinkButton onClick={finish}>{t('common.done')}</LinkButton>
        ) : (
          <>
            <Button onClick={begin} loading={phase === 'loading'} icon={Camera}>
              {t('face.start')}
            </Button>
            <LinkButton
              onClick={() => {
                skip('vitals');
                next();
              }}
            >
              {t('common.skip')}
            </LinkButton>
          </>
        )}
      </Dock>
    </div>
  );
}
