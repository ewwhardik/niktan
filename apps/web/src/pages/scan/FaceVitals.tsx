import { AnimatePresence, motion } from 'motion/react';
import { Camera, Hand, HeartPulse, RefreshCw, Sun, Users } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { grabFrame, useCamera } from '../../cv/camera';
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
type Hint = 'ok' | 'noFace' | 'manyFaces' | 'dark' | 'moving' | 'framing' | 'lighting';

export default function FaceVitals({ next, guide }: StepProps) {
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
  const rejectedTimes = useRef<number[]>([]);
  const finish = useCallback(() => {
    cam.stop();
    const reading = estimate(samples.current, { rejectedTimes: rejectedTimes.current });
    setResult({
      hr: reading.heartRate === null ? null : Math.round(reading.heartRate),
      rr: reading.breathingRate === null ? null : Math.round(reading.breathingRate),
      quality: Math.round(reading.quality * 100) / 100,
    });
    setPhase('result');
    haptic([30, 60, 30]);
  }, [cam.stop]);

  const begin = useCallback(async () => {
    setPhase('loading');
    setHint('ok');
    const signal = await cam.start();
    if (!signal) return;
    let model;
    try {
      model = await loadFaceLandmarker(signal, { pose: true });
    } catch {
      if (!signal.aborted) cam.fail('model');
      return;
    }
    const video = cam.videoRef.current;
    if (!video || signal.aborted) return;
    const canvas = document.createElement('canvas');
    samples.current = [];
    rejectedTimes.current = [];
    wave.current = [];
    setLiveHr(null);
    setProgress(0);
    setPhase('scanning');
    haptic(20);

    const start = performance.now();
    const initialMediaTime = video.currentTime;
    let previousMediaTime = -1;
    let brightnessHistory: { t: number; value: number }[] = [];
    let previousGeometry: ReturnType<typeof faceGeometry> | null = null;
    let lastLive = 0;
    let lastFrameAt = start;
    let restarting = false;
    let frame = 0;
    const hasVideoCallback = typeof video.requestVideoFrameCallback === 'function';
    const timeout = window.setTimeout(finish, SCAN_SECONDS * 1000);
    const watchdog = window.setInterval(() => {
      if (performance.now() - lastFrameAt < 1000) return;
      if (restarting) {
        cam.fail('interrupted');
      } else {
        restarting = true;
        void video.play().catch(() => {
          if (!signal.aborted) cam.fail('interrupted');
        });
      }
    }, 1000);
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      clearInterval(watchdog);
      if (hasVideoCallback) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
    }, { once: true });

    const schedule = () => {
      frame = hasVideoCallback
        ? video.requestVideoFrameCallback((now, meta) => tick(now, meta.mediaTime))
        : requestAnimationFrame((now) => tick(now, video.currentTime));
    };
    const tick = (now: number, mediaTime: number) => {
      if (signal.aborted) return;
      if (video.readyState < 2 || mediaTime <= previousMediaTime) {
        schedule();
        return;
      }
      previousMediaTime = mediaTime;
      lastFrameAt = now;
      restarting = false;
      try {
        const { faceLandmarks: faces, facialTransformationMatrixes: matrices } = model.detectForVideo(video, now);
        let guidance: Hint = 'ok';
        let skin: ReturnType<typeof sampleSkin> = null;
        if (faces.length !== 1) {
          guidance = faces.length ? 'manyFaces' : 'noFace';
          previousGeometry = null;
          brightnessHistory = [];
        } else {
          const lm = faces[0]!;
          const geometry = faceGeometry(lm);
          const aspect = video.videoHeight / video.videoWidth;
          const eyeSpan = Math.hypot(lm[33]!.x - lm[263]!.x, (lm[33]!.y - lm[263]!.y) * aspect);
          const moved = previousGeometry && Math.hypot(geometry.cx - previousGeometry.cx, (geometry.cy - previousGeometry.cy) * aspect) > 0.02 * eyeSpan;
          const pose = matrices[0]?.data;
          // MediaPipe sends its rotation matrix in column-major order.
          const rotated = pose && Math.hypot(pose[2]!, pose[6]!) > Math.sin(20 * Math.PI / 180);
          previousGeometry = geometry;
          if (eyeSpan < 60 / 640) guidance = 'framing';
          else if (moved || rotated) guidance = 'moving';
          else {
            grabFrame(video, 320, canvas);
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            skin = sampleSkin(ctx.getImageData(0, 0, canvas.width, canvas.height), lm);
            if (!skin || skin.brightness > 220) guidance = 'lighting';
            else if (skin.brightness < 50) guidance = 'dark';
            else {
              brightnessHistory = brightnessHistory.filter(({ t }) => t >= mediaTime - 1);
              const recent = brightnessHistory.map(({ value }) => value).sort((a, b) => a - b);
              const baseline = recent[Math.floor(recent.length / 2)];
              if (baseline !== undefined && Math.abs(skin.brightness - baseline) > 0.05 * baseline) guidance = 'lighting';
              brightnessHistory.push({ t: mediaTime, value: skin.brightness });
            }
          }
        }
        if (mediaTime - initialMediaTime >= WARMUP_SECONDS) {
          if (guidance === 'ok' && skin) samples.current.push({ t: mediaTime, r: skin.r, g: skin.g, b: skin.b });
          else rejectedTimes.current.push(mediaTime);
        }
        setHint(guidance);
        setProgress(Math.min(1, (now - start) / (SCAN_SECONDS * 1000)));
        if (guidance !== 'ok') {
          setLiveHr(null);
          wave.current = [];
        } else if (now - lastLive >= 1000) {
          lastLive = now;
          const live = estimate(samples.current.filter(({ t }) => t >= mediaTime - 11), {
            rejectedTimes: rejectedTimes.current.filter((t) => t >= mediaTime - 11),
          });
          wave.current = Array.from(live.pulse.slice(-150));
          setLiveHr(live.heartRate === null ? null : Math.round(live.heartRate));
        }
        schedule();
      } catch {
        cam.fail('model');
      }
    };
    schedule();
  }, [cam.start, cam.fail, cam.videoRef, finish]);

  const hints: Record<Hint, { text: string; icon: typeof Sun }> = {
    ok: { text: t('face.scanning'), icon: HeartPulse },
    noFace: { text: t('face.noFace'), icon: Camera },
    manyFaces: { text: t('face.manyFaces'), icon: Users },
    dark: { text: t('face.tooDark'), icon: Sun },
    framing: { text: t('face.framing'), icon: Camera },
    lighting: { text: t('face.lighting'), icon: Sun },
    moving: { text: t('face.moving'), icon: Hand },
  };
  const H = hints[hint];
  const remaining = Math.max(0, Math.ceil(SCAN_SECONDS * (1 - progress)));

  if (cam.status === 'error' && cam.error) {
    return <CameraProblem error={cam.error} onRetry={() => { cam.stop(); setPhase('intro'); }} onSkip={() => { skip('vitals'); next(); }} />;
  }

  return (
    <div className="flex flex-1 flex-col pt-5">
      {phase === 'intro' && <div className="mb-3">{guide}</div>}
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
            <Button onClick={() => {
              if (result?.hr) record('vitals', { heartRate: result.hr, breathingRate: result.rr, quality: result.quality });
              else skip('vitals');
              next();
            }}>{t('common.next')}</Button>
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
