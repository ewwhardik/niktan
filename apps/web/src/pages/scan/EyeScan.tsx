import { motion } from 'motion/react';
import { Camera, CircleCheck, Eye, ScanEye, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { useTranslation } from 'react-i18next';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { grabFrame, useCamera } from '../../cv/camera';
import { cropImage, eyeHeuristics, locateLowerLid, pallorFromCrop, type EyeHeuristics, type PallorResult } from '../../cv/eye';
import { IRIS, LOWER_LID, loadFaceLandmarker } from '../../cv/face';
import { haptic } from '../../lib/perf';
import { useScan } from '../../state/scan';
import { Button, LinkButton } from '../../ui/Button';
import { Dock } from '../../ui/Layout';
import { Hud, StageFrame, StepLayout, StepTitle } from '../../ui/Chamber';
import { riseChild, spring, staggerParent } from '../../ui/motion';
import { CameraProblem } from './CameraProblem';
import type { StepProps } from './ScanStep';

type Phase = 'straight' | 'lid' | 'result';

/** Guide box for the pulled-down eyelid, as fractions of the camera stage. Centred horizontally so mirroring doesn't move it. */
const LID_BOX = { x: 0.2, y: 0.4, w: 0.6, h: 0.2 };

/** Maps a box on an object-cover video element back to video pixel coordinates. */
function stageBoxToVideo(video: HTMLVideoElement, frameW: number, frameH: number) {
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  const scale = Math.max(cw / frameW, ch / frameH);
  const offX = (frameW * scale - cw) / 2;
  const offY = (frameH * scale - ch) / 2;
  return {
    x: (LID_BOX.x * cw + offX) / scale,
    y: (LID_BOX.y * ch + offY) / scale,
    w: (LID_BOX.w * cw) / scale,
    h: (LID_BOX.h * ch) / scale,
  };
}

export default function EyeScan({ next, guide }: StepProps) {
  const { t } = useTranslation();
  const { record, skip } = useScan();
  const cam = useCamera('user', { idealWidth: 1280, requestTorch: true });
  const model = useRef<FaceLandmarker | null>(null);
  const [phase, setPhase] = useState<Phase>('straight');
  const [hint, setHint] = useState('');
  const [heur, setHeur] = useState<EyeHeuristics | null>(null);
  const [pallor, setPallor] = useState<PallorResult | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const overlay = useRef<HTMLCanvasElement>(null);
  const [locked, setLocked] = useState(false);

  // Live tracking: brackets lock onto both irises (straight look) or trace the lower lid (lid photo).
  useEffect(() => {
    if (cam.status !== 'live' || phase === 'result' || busy) return;
    let raf = 0;
    let stopped = false;
    const radii = { left: 60, right: 60 };
    let lastFrame = -1;
    const tick = () => {
      if (stopped) return;
      const video = cam.videoRef.current;
      const c = overlay.current;
      const lm = model.current;
      // Detect only when the camera has delivered a new frame, not on every display refresh.
      if (video && c && lm && video.readyState >= 2 && video.currentTime !== lastFrame) {
        lastFrame = video.currentTime;
        let faces: NormalizedLandmark[][] = [];
        try {
          faces = lm.detectForVideo(video, performance.now()).faceLandmarks;
        } catch {
          faces = [];
        }
        const cw = c.clientWidth;
        const ch = c.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(cw * dpr)) {
          c.width = Math.round(cw * dpr);
          c.height = Math.round(ch * dpr);
        }
        const ctx = c.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        const face = faces.length === 1 ? faces[0]! : null;
        setLocked(!!face);
        if (face) {
          const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
          const ox = (video.videoWidth * scale - cw) / 2;
          const oy = (video.videoHeight * scale - ch) / 2;
          const X = (p: NormalizedLandmark) => cw - (p.x * video.videoWidth * scale - ox);
          const Y = (p: NormalizedLandmark) => p.y * video.videoHeight * scale - oy;
          ctx.strokeStyle = '#64D2FF';
          ctx.lineCap = 'round';
          if (phase === 'straight') {
            for (const side of ['left', 'right'] as const) {
              const [ctr, a, , b] = IRIS[side].map((i) => face[i]!);
              const r = Math.max(8, Math.hypot(X(a!) - X(b!), Y(a!) - Y(b!)) * 1.1);
              radii[side] += (r - radii[side]) * 0.25;
              const R = radii[side];
              const cx = X(ctr!);
              const cy = Y(ctr!);
              const k = R * 0.45;
              ctx.lineWidth = 2;
              for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
                ctx.beginPath();
                ctx.moveTo(cx + sx * R, cy + sy * (R - k));
                ctx.lineTo(cx + sx * R, cy + sy * R);
                ctx.lineTo(cx + sx * (R - k), cy + sy * R);
                ctx.stroke();
              }
              ctx.fillStyle = '#64D2FF';
              ctx.beginPath();
              ctx.arc(cx, cy, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            for (const side of ['left', 'right'] as const) {
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              LOWER_LID[side].forEach((i, n) => {
                const p = face[i]!;
                if (n === 0) ctx.moveTo(X(p), Y(p));
                else ctx.lineTo(X(p), Y(p));
              });
              ctx.stroke();
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      overlay.current?.getContext('2d')?.clearRect(0, 0, overlay.current.width, overlay.current.height);
    };
  }, [cam.status, cam.videoRef, phase, busy]);

  async function capture() {
    setHint('');
    if (cam.status !== 'live') {
      setBusy(true);
      const signal = await cam.start();
      if (signal) {
        try {
          model.current = await loadFaceLandmarker(signal);
        } catch {
          if (!signal.aborted) cam.fail('model');
        }
      }
      setBusy(false);
      return;
    }

    const video = cam.videoRef.current;
    if (!video || !model.current) return;
    setBusy(true);
    try {
      const canvas = grabFrame(video, 1280);
      const faces = model.current.detectForVideo(canvas, performance.now()).faceLandmarks;
      if (faces.length !== 1) {
        setHint(faces.length ? 'face.manyFaces' : 'face.noFace');
        return;
      }
      const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      if (phase === 'straight') {
        const result = eyeHeuristics(img, faces[0]!);
        setHeur({ ...result, cataract: cam.torch ? result.cataract : null });
        setPhase('lid');
      } else {
        const box = locateLowerLid(faces[0]!, img.width, img.height, stageBoxToVideo(video, img.width, img.height));
        if (!box) {
          setHint('eye.align');
          return;
        }
        const crop = cropImage(img, box.x, box.y, box.w, box.h);
        setPallor(pallorFromCrop(crop));
        const thumbnail = document.createElement('canvas');
        thumbnail.width = crop.width;
        thumbnail.height = crop.height;
        thumbnail.getContext('2d')!.putImageData(new ImageData(crop.data, crop.width, crop.height), 0, 0);
        setThumb(thumbnail.toDataURL('image/jpeg', 0.8));
        cam.stop();
        model.current = null;
        setPhase('result');
      }
      haptic(15);
    } catch {
      cam.fail('unknown');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    cam.stop();
    model.current = null;
    setPhase('straight');
    setPallor(null);
    setHeur(null);
    setThumb(null);
    setHint('');
  }

  function accept() {
    record('eye', {
      pallor: pallor?.flag ?? null,
      pallorScore: pallor ? Math.round(pallor.probability * 1000) / 1000 : null,
      jaundice: heur?.jaundice ?? null,
      cataract: heur?.cataract ?? null,
      quality: pallor ? Math.min(1, pallor.pixels / 1500) : 0,
    });
    next();
  }

  if (cam.status === 'error' && cam.error) {
    return <CameraProblem error={cam.error} onRetry={reset} onSkip={() => { skip('eye'); next(); }} />;
  }

  const rows: { label: string; value: boolean | null }[] = [
    { label: t('eye.pallor'), value: pallor ? pallor.flag : null },
    { label: t('eye.jaundice'), value: heur?.jaundice ?? null },
    { label: t('eye.cataract'), value: heur?.cataract ?? null },
  ];

  const live = cam.status === 'live';
  const stage = phase !== 'result' ? (
    <StageFrame>
      <video ref={cam.videoRef} playsInline muted autoPlay className="absolute inset-0 size-full -scale-x-100 object-cover" />
      <canvas ref={overlay} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      {!live && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(80%_60%_at_50%_45%,#1b2a33_0%,#000_70%)] text-[var(--signal)]">
          <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2, repeat: Infinity }}>
            <ScanEye size={64} strokeWidth={1.1} />
          </motion.div>
          <p className="mono mt-5 text-[11px] tracking-[0.2em] text-white/45 uppercase">CIELAB · on-device</p>
        </div>
      )}
      {live && phase === 'lid' && (
        <motion.div
          className="pointer-events-none absolute rounded-2xl border border-white/80 shadow-[0_0_0_2000px_rgb(0_0_0/0.5)]"
          style={{ left: `${LID_BOX.x * 100}%`, top: `${LID_BOX.y * 100}%`, width: `${LID_BOX.w * 100}%`, height: `${LID_BOX.h * 100}%` }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring.reveal}
        >
          <div className="scan-sweep absolute inset-x-0 h-px bg-[var(--signal)] shadow-[0_0_12px_3px_rgba(100,210,255,0.5)]" />
        </motion.div>
      )}
      {live && (
        <div className="absolute top-4 left-4 flex gap-1.5">
          <Hud label="track" value={locked ? (phase === 'straight' ? 'IRIS LOCK' : 'LID') : 'SEARCH'} tone={locked ? 'good' : 'warn'} />
          <Hud label="torch" value={cam.torch ? 'ON' : 'OFF'} />
        </div>
      )}
      {busy && live && <motion.div className="absolute inset-0 bg-white" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.4 }} />}
    </StageFrame>
  ) : (
    <div className="relative mx-auto flex aspect-square w-full max-w-[400px] items-center justify-center lg:w-[min(60vh,520px)] lg:max-w-none">
      <motion.div className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle_at_50%_35%,#1d2b33,#050607_70%)] ring-1 ring-white/10" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.reveal} />
      {thumb && <motion.img src={thumb} alt="" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.reveal, delay: 0.15 }} className="relative h-28 w-56 rounded-2xl object-cover ring-1 ring-white/20" />}
      <p className="mono absolute bottom-[16%] text-[10px] tracking-[0.18em] text-white/40 uppercase">{t('landing.privacy')}</p>
    </div>
  );

  return (
    <StepLayout stage={stage}>
      {phase !== 'result' ? (
        <div className="flex flex-col gap-5">
          <StepTitle eyebrow={`02 / 05 · ${phase === 'straight' ? 'Sclera · Pupil' : 'Conjunctiva'}`} title={t('eye.title')} body={<><p role={hint ? 'status' : undefined}>{hint ? t(hint) : t(phase === 'straight' ? 'face.instruction' : 'eye.instruction')}</p><p className="mt-2 text-body text-text-3">{t('eye.torch')}</p></>} />
          <div className="flex gap-2">
            {(['straight', 'lid'] as const).map((p, i) => (
              <span key={p} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-caption ${phase === p ? 'bg-accent text-on-accent' : 'bg-white/[0.06] text-text-3'}`}>
                <span className="mono">{i + 1}</span> {p === 'straight' ? t('eye.lookStraight') : t('eye.pullLid')}
              </span>
            ))}
          </div>
          {!busy && cam.status !== 'starting' && guide}
        </div>
      ) : (
        <motion.div variants={staggerParent} initial="hidden" animate="show" className="flex flex-col gap-4">
          <StepTitle eyebrow="02 / 05" title={t('eye.title')} />
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl bg-surface">
            {rows.map((r) => (
              <motion.li variants={riseChild} key={r.label} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3">
                <span className="text-body-lg">{r.label}</span>
                {r.value === null ? (
                  <span className="text-caption text-text-3">{t('common.notChecked')}</span>
                ) : r.value ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-seetoday-tint px-2.5 py-1 text-caption font-medium text-seetoday-ink">
                    <TriangleAlert size={14} aria-hidden /> {t('eye.check')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-routine-tint px-2.5 py-1 text-caption font-medium text-routine-ink">
                    <CircleCheck size={14} aria-hidden /> {t('eye.normal')}
                  </span>
                )}
              </motion.li>
            ))}
          </ul>
          <motion.p variants={riseChild} className="text-caption text-text-3">
            {t('app.notDiagnosis')}
          </motion.p>
        </motion.div>
      )}

      <Dock>
        {phase === 'result' ? (
          <>
            <Button onClick={accept}>{t('common.next')}</Button>
            <LinkButton onClick={reset}>{t('common.retry')}</LinkButton>
          </>
        ) : (
          <>
            <Button icon={live ? (phase === 'straight' ? Eye : Camera) : Camera} loading={busy || cam.status === 'starting'} onClick={capture}>
              {live ? t('eye.capture') : t('eye.openCamera')}
            </Button>
            <LinkButton
              onClick={() => {
                skip('eye');
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
