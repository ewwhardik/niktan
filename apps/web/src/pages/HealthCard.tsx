import { motion, useReducedMotion } from 'motion/react';
import { Ear, Eye, Glasses, HeartPulse, Hospital, Mic, PhoneCall, QrCode, Soup, Stethoscope, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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

function speak(text: string, lang: string, onError: () => void) {
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-IN' : 'hi-IN';
    u.rate = 0.95;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(u.lang.toLowerCase().slice(0, 2)));
    if (voice) u.voice = voice;
    u.onerror = (event) => {
      if (event.error !== 'canceled' && event.error !== 'interrupted') onError();
    };
    synth.speak(u);
  } catch {
    onError();
  }
}

export default function HealthCard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scan = useScan();
  const { hash } = useLocation();
  const sharedId = new URLSearchParams(hash.slice(1)).get('share');
  const isOwn = sharedId === null && !params.has('s');
  const [remote, setRemote] = useState<{ key: string; view: CardView | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shareUrl, setShareUrl] = useState('');
  const [speechFailed, setSpeechFailed] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const lang = i18n.language;
  const sync = scan.sync;

  useEffect(() => {
    if (!sharedId) return;
    let active = true;
    api.get<CardView & { session: { age: number; sex: string } }>(`/api/shared/${encodeURIComponent(sharedId)}/card`)
      .then((c) => { if (active) setRemote({ key: sharedId, view: { ...c, age: c.session.age, sex: c.session.sex } }); })
      .catch(() => { if (active) setRemote({ key: sharedId, view: null }); });
    return () => { active = false; };
  }, [sharedId, attempt]);

  useEffect(() => {
    if (!isOwn) return;
    let active = true;
    void sync().then((id) => {
      if (id && active) return api.post(`/api/sessions/${id}/triage`);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [sync, isOwn, scan.results]);

  const view: CardView | null = useMemo(() => {
    if (!isOwn) return remote?.key === sharedId ? remote.view : null;
    if (!scan.profile || !scan.localTriage) return null;
    return { age: scan.profile.age, sex: scan.profile.sex, ...scan.results, triage: scan.localTriage };
  }, [isOwn, sharedId, remote, scan.profile, scan.localTriage, scan.results]);

  if (deleted) {
    return (
      <Screen>
        <TopBar onBack={() => navigate('/')} />
        <p className="mt-20 text-center text-title-3">{t('card.deleted')}</p>
      </Screen>
    );
  }
  if (!view) {
    if (isOwn) return <Navigate to="/" replace />;
    const failed = !sharedId || remote?.key === sharedId;
    return (
      <Screen>
        <TopBar onBack={() => navigate('/')} title={t('card.title')} />
        <p role="status" className="my-6 text-body-lg">{t(failed ? 'card.shareUnavailable' : 'common.loading')}</p>
        {failed && sharedId && <Button onClick={() => { setRemote(null); setAttempt((n) => n + 1); }}>{t('common.retry')}</Button>}
      </Screen>
    );
  }

  const tr = view.triage;
  const dept = departments[tr.department as DepartmentId];
  const hasResults = !!(
    (view.vitals?.heartRate && view.vitals.quality >= 0.5) ||
    view.eye?.pallor != null || view.eye?.jaundice != null || view.eye?.cataract != null ||
    view.vision?.rightLogMar != null || view.vision?.leftLogMar != null || view.hearing || view.symptoms?.confirmed
  );
  const verdictTitle = t(hasResults ? `card.${tr.priority}` : 'card.incomplete');
  const verdictAction = tr.priority === 'emergency' ? t('card.emergencySub') : `${t('card.department')}: ${pickLang(dept, lang)}`;
  function summaryText() {
    const reasons = tr.reasons.slice(0, 3).map((r) => pickLang(r, lang)).join(', ');
    return hasResults ? `${verdictTitle}. ${verdictAction}. ${reasons}` : verdictTitle;
  }

  const flagRow = (v: boolean | null | undefined): { status: RowStatus; label: string } =>
    v === undefined || v === null ? { status: 'none', label: t('common.notChecked') } : v ? { status: 'check', label: t('card.checkFlag') } : { status: 'normal', label: t('card.noFlag') };

  const hrOk = view.vitals && view.vitals.quality >= 0.5;
  const hr = hrOk ? view.vitals?.heartRate : null;
  const visionRefer = view.vision ? visionNeedsReferral(view.vision) : null;
  function heartRateStatus(): { status: RowStatus; label: string } {
    if (view?.vitals?.heartRate == null) return flagRow(null);
    if (!hrOk) return { status: 'none', label: t('face.quality') + ' ↓' };
    if (view.age < 18) return { status: 'none', label: t('card.recorded') };
    return flagRow(tr.reasons.some((reason) => reason.code.startsWith('hr_')));
  }
  const vocab = new Map(VOCAB.map((s) => [s.code, s]));

  const rows = [
    {
      icon: HeartPulse,
      label: t('card.hr'),
      value: hr ? `${Math.round(hr)}` : '—',
      unit: hr ? t('face.bpm') : '',
      chip: heartRateStatus(),
    },
    { icon: Eye, label: t('card.pallor'), value: '', unit: '', chip: flagRow(view.eye?.pallor) },
    { icon: Eye, label: t('card.jaundice'), value: '', unit: '', chip: flagRow(view.eye?.jaundice) },
    { icon: Eye, label: t('card.cataract'), value: '', unit: '', chip: flagRow(view.eye?.cataract) },
    {
      icon: Glasses,
      label: view.vision ? t(view.vision.distanceMm === 2000 ? 'vision.far' : 'vision.near') : t('card.visionRow'),
      value: view.vision ? `${view.vision.rightLogMar !== null ? snellen6(view.vision.rightLogMar) : '—'} · ${view.vision.leftLogMar !== null ? snellen6(view.vision.leftLogMar) : '—'}` : '',
      unit: '',
      chip: visionRefer === null ? flagRow(null) : visionRefer ? { status: 'refer' as RowStatus, label: t('card.refer') } : view.vision?.leftLogMar == null || view.vision?.rightLogMar == null || view.vision.distanceMm !== 2000 ? { status: 'none' as RowStatus, label: t('card.recorded') } : { status: 'normal' as RowStatus, label: t('card.noFlag') },
    },
    {
      icon: Ear,
      label: t('card.hearingRow'),
      value: '',
      unit: '',
      chip: !view.hearing ? flagRow(null) : { status: 'none' as RowStatus, label: t(`hearing.${view.hearing.result}`) },
    },
  ];

  async function openShare() {
    setBusy(true);
    setError(false);
    try {
      const id = await sync();
      if (!id) throw new Error('Sync failed');
      const { shareId } = await api.post<{ shareId: string }>(`/api/sessions/${id}/share`);
      setShareUrl(`${window.location.origin}/card#share=${encodeURIComponent(shareId)}`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen className="pb-10">
      <TopBar onBack={() => navigate(isOwn ? '/scan/symptoms' : '/')} title={t('card.title')} />

      <div className="mt-2">
        {hasResults ? <VerdictBand priority={tr.priority} title={verdictTitle} action={verdictAction} /> : <h1 className="rounded-lg bg-sunken p-5 text-title-2">{verdictTitle}</h1>}
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
          <Button variant="secondary" icon={Volume2} onClick={() => { setSpeechFailed(false); speak(summaryText(), lang, () => setSpeechFailed(true)); }}>
            {t('common.listen')}
          </Button>
          {isOwn && <Button variant="secondary" icon={QrCode} loading={busy} onClick={openShare}>
            {t('card.share')}
          </Button>}
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

        {speechFailed && <p role="status" className="text-body text-text-2">{t('card.speechUnavailable')}</p>}
        {error && <p role="alert" className="text-body text-emergency-text">{t('card.syncError')}</p>}
        {isOwn && (
          <motion.button variants={riseChild} onClick={() => { setError(false); setConfirmDelete(true); }} className="mx-auto inline-flex min-h-12 items-center gap-2 text-body text-text-3 hover:text-emergency-text">
            <Trash2 size={18} aria-hidden /> {t('card.delete')}
          </motion.button>
        )}
      </motion.div>

      <Sheet open={!!shareUrl} onClose={() => setShareUrl('')} title={t('card.share')}>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="rounded-lg bg-white p-4 shadow-2">
            <QRCodeSVG value={shareUrl} size={220} level="M" />
          </div>
          <p className="text-center text-caption text-text-3">{t('card.shareHint')}</p>
          <input aria-label={t('card.share')} value={shareUrl} readOnly onFocus={(e) => e.target.select()} className="w-full rounded-md bg-sunken p-3 text-body" />
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('card.delete')}>
        <div className="grid grid-cols-2 gap-3 py-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="emergency"
            loading={busy}
            className="!h-14 !text-title-3"
            onClick={async () => {
              setBusy(true);
              setError(false);
              try {
                await scan.deleteScan();
                setDeleted(true);
              } catch {
                setError(true);
              } finally {
                setConfirmDelete(false);
                setBusy(false);
              }
            }}
          >
            {t('card.delete')}
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}
