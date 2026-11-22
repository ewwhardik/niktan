import { motion } from 'motion/react';
import { Camera, CircleCheck, Eye, ScanEye, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { grabFrame, useCamera } from '../../cv/camera';
import { cropImage, eyeHeuristics, locateLowerLid, pallorFromCrop, type EyeHeuristics, type PallorResult } from '../../cv/eye';
import { loadFaceLandmarker } from '../../cv/face';
import { haptic } from '../../lib/perf';
import { useScan } from '../../state/scan';
import { Button, LinkButton } from '../../ui/Button';
import { Dock } from '../../ui/Layout';
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

  return (
    <div className="flex flex-1 flex-col pt-5">
      {phase !== 'result' && !busy && cam.status !== 'starting' && <div className="mb-3">{guide}</div>}
      {phase !== 'result' ? (
        <div className="flex flex-col gap-4">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[360px] overflow-hidden rounded-xl bg-[#111] shadow-3">
            <video ref={cam.videoRef} playsInline muted autoPlay className="absolute inset-0 size-full -scale-x-100 object-cover" />
            {cam.status !== 'live' && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#1c1830] to-[#0e0d12] text-white">
                <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                  <ScanEye size={56} strokeWidth={1.25} />
                </motion.div>
              </div>
            )}
            {cam.status === 'live' && phase === 'straight' && (
              <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden>
                <ellipse cx="150" cy="185" rx="98" ry="132" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="2" strokeDasharray="6 8" />
                <line x1="70" x2="230" y1="160" y2="160" stroke="white" strokeOpacity="0.5" strokeDasharray="3 6" />
              </svg>
            )}
            {cam.status === 'live' && phase !== 'straight' && (
              <motion.div
                className="pointer-events-none absolute rounded-md border-2 border-white shadow-[0_0_0_2000px_rgb(0_0_0/0.45)]"
                style={{ left: `${LID_BOX.x * 100}%`, top: `${LID_BOX.y * 100}%`, width: `${LID_BOX.w * 100}%`, height: `${LID_BOX.h * 100}%` }}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={spring.reveal}
              />
            )}
          </div>
          <motion.p key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="min-h-12 text-center text-body-lg text-text-2">
            {hint ? <span role="status">{t(hint)}</span> : t(phase === 'straight' ? 'face.instruction' : 'eye.instruction')}
            <span className="mt-1 block text-body text-text-3">{t('eye.torch')}</span>
          </motion.p>
        </div>
      ) : (
        <motion.div variants={staggerParent} initial="hidden" animate="show" className="flex flex-col gap-4 pt-4">
          <motion.div variants={riseChild} className="flex items-center gap-4">
            {thumb && <img src={thumb} alt="" className="h-16 w-28 rounded-md object-cover shadow-1" />}
            <div>
              <h2 className="text-title-2 font-semibold">{t('eye.title')}</h2>
              <p className="text-caption text-text-3">{t('landing.privacy')}</p>
            </div>
          </motion.div>
          <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface shadow-1">
            {rows.map((r) => (
              <motion.li variants={riseChild} key={r.label} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
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
            <LinkButton onClick={reset}>
              {t('common.retry')}
            </LinkButton>
          </>
        ) : (
          <>
            <Button icon={cam.status === 'live' ? (phase === 'straight' ? Eye : Camera) : Camera} loading={busy || cam.status === 'starting'} onClick={capture}>
              {cam.status === 'live' ? t('eye.capture') : t('eye.openCamera')}
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
    </div>
  );
}
