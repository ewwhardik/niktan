import { motion, useReducedMotion } from 'motion/react';
import { Ear, Eye, Glasses, HeartPulse, Hospital, Mic, PhoneCall, QrCode, Soup, Stethoscope, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { departments, symptoms as VOCAB, visionNeedsReferral, type DepartmentId, type EyeFlags, type Hearing, type Priority, type Symptoms, type TriageResult, type Vision, type Vitals } from '@niktan/core';
import { pickLang } from '../i18n';
import { api } from '../lib/api';
import { haptic, perfTier } from '../lib/perf';
import { useScan } from '../state/scan';
import { snellen6 } from '../tests/vision';
import { Button } from '../ui/Button';
import { PRIORITY_META, StatusChip, type RowStatus } from '../ui/Chip';
import { Disclaimer, Screen, TopBar } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { ease, riseChild, springs, staggerParent } from '../ui/motion';

interface CardView {
  age: number;
  sex: string;
  vitals?: Vitals | null | undefined;
  eye?: EyeFlags | null | undefined;
  vision?: Vision | null | undefined;
  hearing?: Hearing | null | undefined;
  symptoms?: Symptoms | null | undefined;
  triage: TriageResult;
}

const HAPTIC: Record<Priority, number[]> = { emergency: [80, 60, 80, 60, 200], today: [40, 60, 40], routine: [30] };

function VerdictBand({ priority, title, action }: { priority: Priority; title: string; action: string }) {
  const reduce = useReducedMotion();
  const simple = reduce || perfTier === 'lite';
  const { icon: Icon, solid } = PRIORITY_META[priority];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setTimeout(() => haptic(HAPTIC[priority]), 700);
    return () => clearTimeout(id);
  }, [priority]);
  return (
    <motion.div
      ref={ref}
      role="status"
      aria-live={priority === 'emergency' ? 'assertive' : 'polite'}
      className={`verdict-glow rounded-xl p-5 ${solid}`}
      style={{ ['--verdict' as string]: PRIORITY_META[priority].cssVar }}
      initial={simple ? { opacity: 0 } : { clipPath: 'circle(0% at 44px 44px)' }}
      animate={simple ? { opacity: 1 } : { clipPath: 'circle(150% at 44px 44px)' }}
      transition={simple ? { duration: 0.2, delay: 0.25 } : { duration: 0.5, ease, delay: 0.25 }}
      onAnimationComplete={() => ref.current?.style.setProperty('--glow', '1')}
    >
      <motion.span className="inline-flex" initial={{ scale: reduce ? 1 : 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...(priority === 'emergency' ? springs.verdictUrgent : springs.verdict), delay: 0.4 }}>
        <Icon size={44} strokeWidth={1.5} aria-hidden />
      </motion.span>
      <motion.h1 className="mt-3 text-display font-semibold" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.stagger, delay: 0.5 }}>
        {title}
      </motion.h1>
      <motion.p className="mt-1.5 text-body-lg" initial={{ opacity: 0 }} animate={{ opacity: 0.92 }} transition={{ duration: 0.3, delay: 0.6 }}>
        {action}
      </motion.p>
    </motion.div>
  );
}

function speak(text: string, lang: string) {
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-IN' : 'hi-IN';
    u.rate = 0.95;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(u.lang.toLowerCase().slice(0, 2)));
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    // No TTS on this device.
  }
}

export default function HealthCard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scan = useScan();
  const sharedId = params.get('s');
  const [remote, setRemote] = useState<CardView | null>(null);
  const [server, setServer] = useState<TriageResult | null>(null);
  const [share, setShare] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const lang = i18n.language;

  // A shared card link (?s=…) loads that session from the server, read-only.
  useEffect(() => {
    if (!sharedId || sharedId === scan.sessionId) return;
    api
      .get<{ session: { age: number; sex: string }; vitals: Vitals | null; eye: EyeFlags | null; vision: Vision | null; hearing: Hearing | null; symptoms: Symptoms | null; triage: TriageResult }>(`/api/sessions/${sharedId}/card`)
      .then((c) => setRemote({ age: c.session.age, sex: c.session.sex, ...c }))
      .catch(() => undefined);
  }, [sharedId, scan.sessionId]);

  // Own card: show the on-device verdict instantly, then confirm with the server copy.
  useEffect(() => {
    if (sharedId && sharedId !== scan.sessionId) return;
    let cancelled = false;
    void (async () => {
      await scan.sync();
      if (!scan.sessionId) return;
      try {
        const r = await api.post<TriageResult>(`/api/sessions/${scan.sessionId}/triage`);
        if (!cancelled && r.priority) setServer(r);
      } catch {
        // offline: the local verdict stands
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.sessionId]);

  const view: CardView | null = useMemo(() => {
    if (remote) return remote;
    if (!scan.profile || !scan.localTriage) return null;
    return { age: scan.profile.age, sex: scan.profile.sex, ...scan.results, triage: server ?? scan.localTriage };
  }, [remote, scan.profile, scan.localTriage, scan.results, server]);

  useEffect(() => {
    if (view && !sharedId) {
      const id = setTimeout(() => speak(summaryText(), lang), 1200);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.triage.priority]);

  if (deleted) {
    return (
      <Screen>
        <TopBar onBack={() => navigate('/')} />
        <p className="mt-20 text-center text-title-3">{t('card.deleted')}</p>
      </Screen>
    );
  }
  if (!view) return sharedId ? <Screen><div className="skeleton mt-20 h-48 rounded-xl" /></Screen> : <Navigate to="/" replace />;

  const tr = view.triage;
  const dept = departments[tr.department as DepartmentId];
  const verdictTitle = t(`card.${tr.priority}`);
  const verdictAction = tr.priority === 'emergency' ? t('card.emergencySub') : `${t('card.department')}: ${pickLang(dept, lang)}`;
  function summaryText() {
    const reasons = tr.reasons.slice(0, 3).map((r) => pickLang(r, lang)).join(', ');
    return `${verdictTitle}. ${verdictAction}. ${reasons}`;
  }

  const flagRow = (v: boolean | null | undefined): { status: RowStatus; label: string } =>
    v === undefined || v === null ? { status: 'none', label: t('common.notChecked') } : v ? { status: 'check', label: t('card.checkFlag') } : { status: 'normal', label: t('card.normal') };

  const hrOk = view.vitals && view.vitals.quality >= 0.5;
  const hr = view.vitals?.heartRate;
  const visionRefer = view.vision ? visionNeedsReferral(view.vision) : null;
  const vocab = new Map(VOCAB.map((s) => [s.code, s]));

  const rows = [
    {
      icon: HeartPulse,
      label: t('card.hr'),
      value: hr ? `${Math.round(hr)}` : '—',
      unit: hr ? t('face.bpm') : '',
      chip: !view.vitals ? flagRow(null) : !hrOk ? { status: 'none' as RowStatus, label: t('face.quality') + ' ↓' } : hr! > 110 || hr! < 50 ? { status: 'check' as RowStatus, label: t('card.checkFlag') } : { status: 'normal' as RowStatus, label: t('card.normal') },
    },
    { icon: Eye, label: t('card.pallor'), value: '', unit: '', chip: flagRow(view.eye?.pallor) },
    { icon: Eye, label: t('card.jaundice'), value: '', unit: '', chip: flagRow(view.eye?.jaundice) },
    { icon: Eye, label: t('card.cataract'), value: '', unit: '', chip: flagRow(view.eye?.cataract) },
    {
      icon: Glasses,
      label: t('card.visionRow'),
      value: view.vision ? `${view.vision.rightLogMar !== null ? snellen6(view.vision.rightLogMar) : '—'} · ${view.vision.leftLogMar !== null ? snellen6(view.vision.leftLogMar) : '—'}` : '',
      unit: '',
      chip: visionRefer === null ? flagRow(null) : visionRefer ? { status: 'refer' as RowStatus, label: t('card.refer') } : { status: 'normal' as RowStatus, label: t('card.normal') },
    },
    {
      icon: Ear,
      label: t('card.hearingRow'),
      value: '',
      unit: '',
      chip: !view.hearing ? flagRow(null) : view.hearing.result === 'refer' ? { status: 'refer' as RowStatus, label: t('card.refer') } : { status: 'normal' as RowStatus, label: t('card.normal') },
    },
  ];

  const shareUrl = view && scan.sessionId ? `${window.location.origin}/card?s=${scan.sessionId}` : '';
  const isOwn = !remote;

  return (
    <Screen className="pb-10">
      <TopBar onBack={() => navigate(isOwn ? '/scan/symptoms' : '/')} title={t('card.title')} />

      <div className="mt-2">
        <VerdictBand priority={tr.priority} title={verdictTitle} action={verdictAction} />
      </div>

      {tr.priority === 'emergency' && (
        <motion.a href="tel:108" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springs.verdictUrgent, delay: 0.7 }} onClick={() => haptic(30)} className="cta-emergency mt-4 flex h-16 items-center justify-center gap-3 rounded-md bg-emergency text-title-2 font-semibold text-emergency-on shadow-3">
          <PhoneCall size={24} aria-hidden /> {t('card.call108')}
        </motion.a>
      )}

      <motion.div variants={staggerParent} initial="hidden" animate="show" transition={{ delayChildren: 0.8 }} className="mt-5 flex flex-col gap-4">
        {tr.reasons.length > 0 && (
          <motion.section variants={riseChild} className="rounded-lg bg-surface p-5 shadow-1">
            <h2 className="flex items-center gap-2 text-label font-medium text-text-2">
              <Stethoscope size={18} aria-hidden /> {t('card.why')}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {tr.reasons.slice(0, 6).map((r) => (
                <li key={r.code} className="flex items-start gap-2.5 text-body-lg">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-text-3" />
                  {pickLang(r, lang)}
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        <motion.section variants={riseChild} className="divide-y divide-border rounded-lg bg-surface shadow-1">
          {rows.map((r) => (
            <div key={r.label} className="flex min-h-16 items-center gap-3 px-4 py-3">
              <r.icon size={22} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden />
              <span className="min-w-0 flex-1 text-body-lg">{r.label}</span>
              {r.value && (
                <span className="tnum text-title-3 font-semibold">
                  {r.value}
                  {r.unit && <span className="ml-1 text-caption font-normal text-text-3">{r.unit}</span>}
                </span>
              )}
              <StatusChip status={r.chip.status} label={r.chip.label} />
            </div>
          ))}
          <div className="flex items-start gap-3 px-4 py-3">
            <Mic size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-3" aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="text-body-lg">{t('card.symptomsRow')}</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(view.symptoms?.symptoms ?? []).length === 0 ? (
                  <span className="text-caption text-text-3">{view.symptoms ? t('symptoms.nothing') : t('common.notChecked')}</span>
                ) : (
                  view.symptoms!.symptoms.map((s) => {
                    const v = vocab.get(s.code);
                    return (
                      <span key={s.code} className="rounded-full bg-sunken px-2.5 py-1 text-caption">
                        {v ? pickLang(v, lang) : s.code}
                        {s.durationDays ? ` · ${t('symptoms.duration', { n: s.durationDays })}` : ''}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </motion.section>

        <motion.div variants={riseChild} className="grid grid-cols-2 gap-3">
          <Button variant="secondary" icon={Volume2} onClick={() => speak(summaryText(), lang)}>
            {t('common.listen')}
          </Button>
          <Button variant="secondary" icon={QrCode} onClick={() => setShare(true)} disabled={!shareUrl}>
            {t('card.share')}
          </Button>
        </motion.div>

        {isOwn && (
          <motion.div variants={riseChild} className="flex flex-col gap-3">
            {tr.priority !== 'emergency' && (
              <Button icon={Hospital} onClick={() => navigate('/queue')}>
                {t('card.joinQueue')}
              </Button>
            )}
            <Button variant="secondary" icon={Soup} onClick={() => navigate('/thali')}>
              {t('card.scanThali')}
            </Button>
            <button onClick={() => navigate('/feedback')} className="min-h-12 text-body text-accent-text underline-offset-4 hover:underline">
              {t('feedback.title')}
            </button>
          </motion.div>
        )}

        <motion.div variants={riseChild}>
          <Disclaimer />
        </motion.div>

        {isOwn && scan.sessionId && (
          <motion.button variants={riseChild} onClick={() => setConfirmDelete(true)} className="mx-auto inline-flex min-h-12 items-center gap-2 text-body text-text-3 hover:text-emergency-text">
            <Trash2 size={18} aria-hidden /> {t('card.delete')}
          </motion.button>
        )}
      </motion.div>

      <Sheet open={share} onClose={() => setShare(false)} title={t('card.share')}>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="rounded-lg bg-white p-4 shadow-2">
            <QRCodeSVG value={shareUrl} size={220} level="M" />
          </div>
          <p className="text-center text-caption text-text-3">{t('app.notDiagnosis')}</p>
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('card.delete')}>
        <div className="grid grid-cols-2 gap-3 py-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="emergency"
            className="!h-14 !text-title-3"
            onClick={async () => {
              if (scan.sessionId) await api.del(`/api/sessions/${scan.sessionId}`).catch(() => undefined);
              scan.reset();
              setConfirmDelete(false);
              setDeleted(true);
            }}
          >
            {t('card.delete')}
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}
