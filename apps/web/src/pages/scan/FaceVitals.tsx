import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Camera, Hand, HeartPulse, RefreshCw, Sun, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { useTranslation } from 'react-i18next';
import { grabFrame, useCamera } from '../../cv/camera';
import { faceGeometry, LandmarkSmoother, loadFaceLandmarker, ROI, regionPixelsChanged, sampleSkin } from '../../cv/face';
import { estimateMulti, type MultiSample } from '../../cv/rppg2';
import { estimate, type RgbSample } from '../../cv/rppg';
import { haptic } from '../../lib/perf';
import { useScan } from '../../state/scan';
import { Button, LinkButton } from '../../ui/Button';
import { Dock } from '../../ui/Layout';
import { Hud, StageFrame, StepLayout, StepTitle } from '../../ui/Chamber';
import { CountUp } from '../../ui/Numbers';
import { ScanRing } from '../../ui/ScanRing';
import { Waveform } from '../../ui/Waveform';
import { spring } from '../../ui/motion';
import type { StepProps } from './ScanStep';
import { CameraProblem } from './CameraProblem';

const SCAN_SECONDS = 30;
const WARMUP_SECONDS = 2;
const ACQUISITION_SECONDS = 20;
const FACE_OUTLINE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

type Phase = 'intro' | 'loading' | 'scanning' | 'result';
type Hint = 'ok' | 'noFace' | 'manyFaces' | 'dark' | 'moving' | 'framing' | 'lighting' | 'frozen';

export default function FaceVitals({ next, guide }: StepProps) {
  const { t } = useTranslation();
  const { record, skip } = useScan();
  const cam = useCamera('user');
  const [phase, setPhase] = useState<Phase>('intro');
  const [hint, setHint] = useState<Hint>('noFace');
  const reduceMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [liveHr, setLiveHr] = useState<number | null>(null);
  const [result, setResult] = useState<{ hr: number | null; rr: number | null; quality: number } | null>(null);
  const wave = useRef<number[]>([]);
  const samples = useRef<RgbSample[]>([]);
  const rejectedTimes = useRef<number[]>([]);
  const multi = useRef<MultiSample[]>([]);
  const smoother = useRef(new LandmarkSmoother());
  const mesh = useRef<HTMLCanvasElement>(null);
  const telemetry = useRef({ light: 0, quality: 0, fps: 0, frames: 0, since: 0, progress: 0 });
  const [hud, setHud] = useState({ light: 0, quality: 0, fps: 0 });

  // Instrument read-outs refresh at 4 Hz; the camera loop itself never re-renders React.
  useEffect(() => {
    if (phase !== 'scanning') return;
    const id = window.setInterval(() => {
      const tm = telemetry.current;
      setHud({ light: tm.light, quality: tm.quality, fps: tm.fps });
      setProgress(tm.progress);
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  const finish = useCallback(() => {
    cam.stop();
    // v2 (multi-region fusion) is primary; v1 on the averaged trace is the fallback.
    const v2 = estimateMulti(multi.current);
    const reading = v2.heartRate !== null ? v2 : estimate(samples.current, { rejectedTimes: rejectedTimes.current });
    setResult({
      hr: reading.heartRate === null ? null : Math.round(reading.heartRate),
      rr: reading.breathingRate === null ? null : Math.round(reading.breathingRate),
      quality: Math.round(reading.quality * 100) / 100,
    });
    setPhase('result');
    haptic([30, 60, 30]);
  }, [cam.stop]);

  /** Paints the landmark mesh and the sampled skin regions over the mirrored, object-cover video. */
  const drawMesh = useCallback((video: HTMLVideoElement, lm: NormalizedLandmark[] | null, ok: boolean) => {
    const c = mesh.current;
    if (!c) return;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!lm) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(cw / vw, ch / vh);
    const ox = (vw * scale - cw) / 2;
    const oy = (vh * scale - ch) / 2;
    const px = (p: NormalizedLandmark) => cw - (p.x * vw * scale - ox);
    const py = (p: NormalizedLandmark) => p.y * vh * scale - oy;
    const signal = ok ? 'rgba(89,248,200,' : 'rgba(247,178,59,';
    ctx.beginPath();
    FACE_OUTLINE.forEach((index, i) => {
      const point = lm[index]!;
      if (i === 0) ctx.moveTo(px(point), py(point));
      else ctx.lineTo(px(point), py(point));
    });
    ctx.closePath();
    ctx.strokeStyle = `${signal}0.46)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    for (let i = 0; i < lm.length; i += 2) {
      const p = lm[i]!;
      ctx.fillRect(px(p) - 0.7, py(p) - 0.7, 1.4, 1.4);
    }
    for (const [name, poly] of Object.entries(ROI)) {
      const xs = poly.map(i => px(lm[i]!));
      const ys = poly.map(i => py(lm[i]!));
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      ctx.beginPath();
      poly.forEach((idx, k) => {
        const p = lm[idx]!;
        if (k === 0) ctx.moveTo(px(p), py(p));
        else ctx.lineTo(px(p), py(p));
      });
      ctx.closePath();
      ctx.fillStyle = `${signal}0.16)`;
      ctx.fill();
      ctx.strokeStyle = `${signal}0.85)`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (ok && !reduceMotion) {
        // Clip the sweep to the measured polygon, so it follows the skin as the face moves.
        ctx.save();
        ctx.clip();
        const y = top + (bottom - top) * ((video.currentTime % 1.8) / 1.8);
        ctx.fillStyle = 'rgba(202,255,237,.75)';
        ctx.fillRect(Math.min(...xs), y, Math.max(...xs) - Math.min(...xs), 2);
        ctx.restore();
      }
      ctx.font = '600 11px system-ui';
      const label = t('face.' + name);
      const width = ctx.measureText(label).width + 12;
      const x = Math.max(3, Math.min(cw - width - 3, (Math.min(...xs) + Math.max(...xs) - width) / 2));
      const y = Math.max(4, Math.min(ch - 22, name === 'forehead' ? top - 21 : (top + bottom) / 2 - 9));
      ctx.fillStyle = 'rgba(8,22,26,.86)';
      ctx.fillRect(x, y, width, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 6, y + 13);
    }
  }, [reduceMotion, t]);

  const begin = useCallback(async () => {
    setPhase('loading');
    setHint('noFace');
    const signal = await cam.start();
    if (!signal) return;
    let model;
    try {
      model = await loadFaceLandmarker(signal, { pose: true, preferCpu: true });
    } catch {
      if (!signal.aborted) cam.fail('model');
      return;
    }
    const video = cam.videoRef.current;
    if (!video || signal.aborted) return;
    const canvas = document.createElement('canvas');
    samples.current = [];
    multi.current = [];
    smoother.current.reset();
    rejectedTimes.current = [];
    wave.current = [];
    setLiveHr(null);
    setProgress(0);
    setPhase('scanning');
    haptic(20);

    const start = performance.now();
    telemetry.current = { light: 0, quality: 0, fps: 0, frames: 0, since: start, progress: 0 };
    let initialMediaTime: number | null = null;
    let captureTimer: number | undefined;
    let generation = 0;
    let pending = false;
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../../cv/livePulse.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        pending = false;
        if (signal.aborted || data.generation !== generation) return;
        telemetry.current.quality = data.quality;
        wave.current = data.wave;
        setLiveHr(data.heartRate === null ? null : Math.round(data.heartRate));
      };
      worker.onerror = () => { worker?.terminate(); worker = null; };
    } catch {
      // Final estimation still runs after capture when workers are unavailable.
    }
    let previousMediaTime = -1;
    let previousImage: ImageData | null = null;
    let lastChange = -Infinity;
    let brightnessHistory: { t: number; value: number }[] = [];
    let previousGeometry: ReturnType<typeof faceGeometry> | null = null;
    let lastLive = 0;
    let lastFrameAt = start;
    let restarting = false;
    let frame = 0;
    const hasVideoCallback = typeof video.requestVideoFrameCallback === 'function';
    const acquisitionTimer = window.setTimeout(finish, ACQUISITION_SECONDS * 1000);
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
      clearTimeout(acquisitionTimer);
      clearTimeout(captureTimer);
      worker?.terminate();
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
        grabFrame(video, 320, canvas);
        const { faceLandmarks: faces, facialTransformationMatrixes: matrices } = model.detectForVideo(canvas, now);
        let guidance: Hint = 'ok';
        let changed = false;
        let skin: ReturnType<typeof sampleSkin> = null;
        let tracked = faces.length === 1 ? faces[0]! : null;
        const tm = telemetry.current;
        tm.frames++;
        if (now - tm.since >= 1000) {
          tm.fps = Math.round((tm.frames * 1000) / (now - tm.since || 1));
          tm.frames = 0;
          tm.since = now;
        }
        if (faces.length !== 1) {
          guidance = faces.length ? 'manyFaces' : 'noFace';
          previousGeometry = null;
          previousImage = null;
          smoother.current.reset();
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
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            // Smoothed landmarks keep each region on the same skin pixels from frame to frame.
            tracked = smoother.current.filter(lm, mediaTime);
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            changed = previousImage !== null && regionPixelsChanged(previousImage, image, tracked);
            if (!previousImage || changed) lastChange = mediaTime;
            previousImage = image;
            skin = sampleSkin(image, tracked);
            if (skin) telemetry.current.light = skin.brightness;
            if (!skin || skin.brightness > 220) guidance = 'lighting';
            else if (skin.brightness < 50) guidance = 'dark';
            else if (!changed && mediaTime - lastChange > 0.75) guidance = 'frozen';
            else {
              brightnessHistory = brightnessHistory.filter(({ t }) => t >= mediaTime - 1);
              const recent = brightnessHistory.map(({ value }) => value).sort((a, b) => a - b);
              const baseline = recent[Math.floor(recent.length / 2)];
              if (baseline !== undefined && Math.abs(skin.brightness - baseline) > 0.05 * baseline) guidance = 'lighting';
              brightnessHistory.push({ t: mediaTime, value: skin.brightness });
            }
          }
        }
        if (initialMediaTime === null && guidance === 'ok' && changed) {
          initialMediaTime = mediaTime;
          clearTimeout(acquisitionTimer);
          captureTimer = window.setTimeout(finish, SCAN_SECONDS * 1000);
        }
        if (initialMediaTime !== null && mediaTime - initialMediaTime >= WARMUP_SECONDS) {
          if (guidance === 'ok' && changed && skin) {
            samples.current.push({ t: mediaTime, r: skin.r, g: skin.g, b: skin.b });
            multi.current.push({ t: mediaTime, rois: skin.rois });
          }
          else rejectedTimes.current.push(mediaTime);
        }
        setHint(guidance);
        telemetry.current.progress = initialMediaTime === null ? 0 : Math.min(1, (mediaTime - initialMediaTime) / SCAN_SECONDS);
        drawMesh(video, tracked, guidance === 'ok');
        if (guidance !== 'ok') {
          generation++;
          tm.quality = 0;
          if (!skin) tm.light = 0;
          setLiveHr(null);
          wave.current = [];
        } else if (worker && !pending && now - lastLive >= 1000 && multi.current.length >= 120) {
          lastLive = now;
          pending = true;
          worker.postMessage({ samples: multi.current.filter(({ t }) => t >= mediaTime - 11), generation });
        }
        schedule();
      } catch {
        cam.fail('model');
      }
    };
    schedule();
  }, [cam.start, cam.fail, cam.videoRef, finish, drawMesh]);

  const hints: Record<Hint, { text: string; icon: typeof Sun }> = {
    ok: { text: t('face.scanning'), icon: HeartPulse },
    frozen: { text: t('face.frozen'), icon: Camera },
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

  const lightPct = Math.round((hud.light / 255) * 100);
  const bars = Math.round(hud.quality * 4);
  const stage = (
    <StageFrame>
      <video ref={cam.videoRef} playsInline muted autoPlay className="absolute inset-0 size-full -scale-x-100 object-cover" />
      <canvas ref={mesh} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      {phase === 'intro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(80%_60%_at_50%_45%,#1b2a33_0%,#000_70%)] text-white">
          <motion.div animate={{ scale: [1, 1.1, 1, 1.06, 1] }} transition={{ duration: 1.2, repeat: Infinity, times: [0, 0.12, 0.3, 0.42, 1] }} className="text-[var(--signal)]">
            <HeartPulse size={64} strokeWidth={1.1} />
          </motion.div>
          <p className="mono mt-5 text-[11px] tracking-[0.2em] text-white/45 uppercase">rPPG · POS · 30 s</p>
        </div>
      )}
      {(phase !== 'scanning' || hint === 'noFace' || hint === 'manyFaces' || hint === 'framing') && <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden>
        <defs>
          <mask id="face-oval">
            <rect width="300" height="400" fill="white" />
            <ellipse cx="150" cy="185" rx="98" ry="132" fill="black" />
          </mask>
        </defs>
        <rect width="300" height="400" fill="rgb(0 0 0 / 0.5)" mask="url(#face-oval)" />
        <ellipse cx="150" cy="185" rx="98" ry="132" fill="none" stroke={phase === 'scanning' && hint !== 'ok' ? '#F7B23B' : 'white'} strokeOpacity={0.55} strokeWidth="1" strokeDasharray={phase === 'scanning' ? '0' : '3 6'} />
      </svg>}
      {phase === 'loading' && <ScanRing state="searching" className="top-[13.25%] left-[17.33%] h-[66%] w-[65.34%]" />}
      {phase === 'scanning' && (
        <>
          <div className="absolute inset-x-0 top-0 h-[3px] bg-white/10">
            <div className="h-full origin-left bg-[var(--signal)] transition-transform duration-300 ease-linear" style={{ transform: `scaleX(${progress})` }} />
          </div>
          <div className="absolute top-4 left-4 flex flex-col gap-1.5">
            <Hud label="signal" value={<span>{'▮'.repeat(bars)}<span className="opacity-25">{'▮'.repeat(4 - bars)}</span></span>} tone={bars >= 2 ? 'good' : 'warn'} />
            <Hud label="light" value={`${lightPct}%`} tone={lightPct > 20 && lightPct < 86 ? 'muted' : 'warn'} />
            <Hud label="fps" value={hud.fps || '—'} />
          </div>
          <div className="absolute top-4 right-4">
            <Hud label="t-minus" value={`${String(remaining).padStart(2, '0')}s`} />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent px-5 pt-4 pb-3 text-white">
            <div className="flex items-end justify-between">
              <div className="flex items-baseline gap-2">
                <AnimatePresence mode="popLayout">
                  <motion.span key={liveHr ?? 'x'} initial={{ y: 10, opacity: 0, filter: 'blur(4px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: -10, opacity: 0 }} className="tnum text-[2.75rem] leading-none font-semibold tracking-tight">
                    {liveHr ?? '— —'}
                  </motion.span>
                </AnimatePresence>
                <span className="serif text-title-3 text-white/60 italic">bpm</span>
              </div>
              {liveHr && (
                <motion.span className="text-[var(--emergency)]" animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 60 / liveHr, repeat: Infinity }}>
                  <HeartPulse size={26} aria-hidden />
                </motion.span>
              )}
            </div>
            <div className="mt-2 drop-shadow-[0_0_10px_rgba(100,210,255,0.55)]">
              <Waveform source={wave} color="#64D2FF" height={40} />
            </div>
          </div>
        </>
      )}
    </StageFrame>
  );

  return (
    <StepLayout stage={phase === 'result' ? <ResultOrb hr={result?.hr ?? null} /> : stage}>
      <AnimatePresence mode="wait" initial={false}>
        {phase !== 'result' ? (
          <motion.div key="panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.reveal} className="flex flex-col gap-5">
            <StepTitle eyebrow="01 / 05 · rPPG" title={t('face.title')} body={phase === 'scanning' ? null : <><p>{t('face.instruction')}</p><p className="mt-2 text-body text-text-3">{t('face.light')}</p></>} />
            {phase === 'intro' && guide}
            {phase === 'scanning' && (
              <div aria-live="polite" className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3 text-body-lg ${hint === 'ok' ? 'bg-white/[0.06] text-text' : 'bg-seetoday-tint text-seetoday-ink'}`}>
                <motion.span key={hint} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.chip}>
                  <H.icon size={22} strokeWidth={1.75} aria-hidden />
                </motion.span>
                <motion.span key={`${hint}-t`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}>
                  {H.text}
                </motion.span>
              </div>
            )}
            {phase === 'scanning' && (
              <p className="text-body text-text-3">{hint === 'ok' ? t(hud.fps > 0 && hud.fps < 12 ? 'face.slow' : liveHr ? 'face.tracked' : 'face.collecting') : (hint === 'noFace' || hint === 'manyFaces' ? t('face.instruction') : t('face.realign'))}</p>
            )}
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.reveal} className="flex flex-col gap-5">
            <StepTitle eyebrow="01 / 05 · rPPG" title={t('face.result')} />
            {result?.hr ? (
              <>
                <div>
                  <div className="flex justify-between text-caption text-text-3">
                    <span>{t('face.quality')}</span>
                    <span className="tnum">{Math.round(result.quality * 100)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <motion.div className={`h-full origin-left rounded-full ${result.quality >= 0.5 ? 'bg-[var(--signal-2)]' : 'bg-seetoday'}`} initial={{ scaleX: 0 }} animate={{ scaleX: result.quality }} transition={{ ...spring.reveal, delay: 0.3 }} />
                  </div>
                </div>
                {result.rr && (
                  <p className="text-body text-text-2">
                    {t('face.breathing')}: <span className="tnum font-semibold text-text">{result.rr}</span>/min
                  </p>
                )}
                {result.quality < 0.5 && <p className="text-body text-seetoday-text">{t('face.lowQuality')}</p>}
              </>
            ) : (
              <p className="text-body-lg text-text-2">{t('face.lowQuality')}</p>
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
    </StepLayout>
  );
}

/** Result: the number lands inside a ring that keeps beating at the measured rate. */
function ResultOrb({ hr }: { hr: number | null }) {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[400px] items-center justify-center lg:w-[min(60vh,520px)] lg:max-w-none">
      {hr && [0, 1, 2].map((i) => (
        <motion.span key={i} className="absolute inset-[12%] rounded-full border border-[var(--signal)]" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.45, opacity: 0 }} transition={{ duration: (60 / hr) * 2, repeat: Infinity, delay: i * (60 / hr) * 0.66, ease: 'easeOut' }} />
      ))}
      <motion.div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_50%_35%,#1d2b33,#050607_70%)] ring-1 ring-white/10" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: hr ? [1, 1.03, 1] : 1, opacity: 1 }} transition={hr ? { scale: { duration: 60 / hr, repeat: Infinity }, opacity: { duration: 0.4 } } : spring.reveal} />
      <div className="relative text-center">
        {hr ? (
          <>
            <CountUp value={hr} className="block text-[clamp(5rem,18vw,8.5rem)] leading-none font-semibold tracking-tight" />
            <span className="serif mt-1 block text-title-1 text-text-2 italic">{t('face.bpm')}</span>
          </>
        ) : (
          <HeartPulse size={64} strokeWidth={1.1} className="text-text-3" aria-hidden />
        )}
      </div>
    </div>
  );
}
