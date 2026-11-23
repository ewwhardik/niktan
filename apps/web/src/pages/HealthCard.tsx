import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, ClipboardCheck, ClipboardList, Ear, Eye, Glasses, HeartPulse, Hospital, Mic, OctagonAlert, PhoneCall, Plus, QrCode, Stethoscope, Thermometer, Ticket, Trash2, TriangleAlert, Volume2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { departments, symptoms as VOCAB, visionExtraReasons, visionNeedsReferral, type DepartmentId, type EyeFlags, type Hearing, type Priority, type Symptoms, type TriageResult, type Vision, type Vitals } from '@niktan/core';
import { pickLang } from '../i18n';
import { api } from '../lib/api';
import { haptic, perfTier } from '../lib/perf';
import { SCREENING_STEPS, stepsFor, STEP_MINUTES, useScan } from '../state/scan';
import { snellen6 } from '../tests/vision';
import { visionExtrasLine } from '../tests/visionSummary';
import { cataractView, jaundiceView } from '../tests/eyeSummary';
import { BrandMark } from '../ui/BrandMark';
import { Button } from '../ui/Button';
import { PRIORITY_META, StatusChip, type RowStatus } from '../ui/Chip';
import { Disclaimer, Screen, TopBar } from '../ui/Layout';
import type { Callout, CalloutTone } from '../ui/three/AnatomyViewer';
import { anchors } from '../ui/three/anchors';

const AnatomyViewer = lazy(() => import('../ui/three/AnatomyViewer'));

/** Icon and tint per reason type, so the "why" list scans at a glance. */
function ReasonIcon({ code }: { code: string }) {
  const [Icon, cls] = code.startsWith('red_flag') || code.startsWith('hr_very')
    ? [OctagonAlert, 'bg-emergency-tint text-emergency-ink']
    : code.startsWith('hr_')
      ? [HeartPulse, 'bg-[#ffe5ea] text-[#c2185b]']
      : /pallor|jaundice|cataract|vision/.test(code)
        ? [Eye, 'bg-[#e3f1ff] text-[#0a6fd6]']
        : code.startsWith('hearing')
          ? [Ear, 'bg-[#e2f7ea] text-[#167c3f]']
          : /fever/.test(code)
            ? [Thermometer, 'bg-seetoday-tint text-seetoday-ink']
            : code.startsWith('declined') || code.startsWith('severe')
              ? [TriangleAlert, 'bg-seetoday-tint text-seetoday-ink']
              : [Stethoscope, 'bg-[#f2f2f5] text-[#515154]'];
  return (
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${cls}`}>
      <Icon size={16} strokeWidth={1.9} aria-hidden />
    </span>
  );
}
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
  if (priority === 'emergency') return <div role="alert" className={`rounded-xl p-5 ${solid}`}><Icon size={34} aria-hidden /><h1 className="my-2 text-display font-semibold">{title}</h1><p className="text-body-lg">{action}</p></div>;
  return (
    <motion.div
      ref={ref}
      role="status"
      aria-live="polite"
      className={`verdict-glow rounded-xl p-5 ${solid}`}
      style={{ ['--verdict' as string]: PRIORITY_META[priority].cssVar }}
      initial={simple ? { opacity: 0 } : { clipPath: 'circle(0% at 44px 44px)' }}
      animate={simple ? { opacity: 1 } : { clipPath: 'circle(150% at 44px 44px)' }}
      transition={simple ? { duration: 0.2, delay: 0.25 } : { duration: 0.5, ease, delay: 0.25 }}
      onAnimationComplete={() => ref.current?.style.setProperty('--glow', '1')}
    >
      <motion.span className="inline-flex" initial={{ scale: reduce ? 1 : 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...springs.verdict, delay: 0.4 }}>
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
  const [selectedObservation, selectObservation] = useState('heart');
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
  if (!view && isOwn) {
    return (
      <Screen>
        <TopBar onBack={() => navigate('/')} />
        <div className="mx-auto flex max-w-sm flex-col items-center px-4 pt-16 pb-10 text-center sm:pt-24">
          <span className="grid size-16 place-items-center rounded-3xl bg-sunken text-text">
            <ClipboardList size={30} strokeWidth={1.5} aria-hidden />
          </span>
          <h1 className="mt-6 text-title-1 font-semibold">{t('card.title')}</h1>
          <p className="mt-3 text-body-lg text-text-2">{t('card.empty')}</p>
          <Button trailingIcon={ArrowRight} onClick={() => navigate('/start')} className="mt-7">{t('landing.cta')}</Button>
        </div>
      </Screen>
    );
  }
  if (!view) {
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
  const visionRefer = view.vision ? visionNeedsReferral(view.vision) || visionExtraReasons(view.vision).length > 0 : null;
  const vocab = new Map(VOCAB.map((s) => [s.code, s]));

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

  const v = view;
  const pallorTone: CalloutTone = v.eye?.pallor == null ? 'none' : v.eye.pallor ? 'check' : 'normal';
  const jaundice = jaundiceView(v.eye, t);
  const cataract = cataractView(v.eye, v.age, v.vision, t);
  const riskRow = (r: typeof jaundice): { status: RowStatus; label: string } =>
    r.level === null ? { status: 'none', label: t('common.notChecked') } : r.level === 'low' ? { status: 'normal', label: r.label } : { status: 'check', label: r.label };
  const eyeFlagged = !!(v.eye?.pallor || (jaundice.level && jaundice.level !== 'low') || (cataract.level && cataract.level !== 'low'));
  const eyeTone: CalloutTone = v.eye?.pallor == null && jaundice.level === null && cataract.level === null ? 'none' : eyeFlagged ? 'check' : 'normal';
  const hrTone: CalloutTone = !hr ? 'none' : tr.priority === 'emergency' && tr.reasons.some((r) => r.code.startsWith('hr_')) ? 'alert' : tr.reasons.some((r) => r.code.startsWith('hr_')) ? 'check' : 'normal';
  const visionTone: CalloutTone = visionRefer === null ? 'none' : visionRefer ? 'check' : 'normal';
  const hearingTone: CalloutTone = !v.hearing ? 'none' : v.hearing.result === 'refer' || v.hearing.tones?.asymmetry || v.hearing.tones?.highDrop ? 'check' : 'normal';
  const visionValue = v.vision ? `${v.vision.rightLogMar !== null ? snellen6(v.vision.rightLogMar) : '—'} · ${v.vision.leftLogMar !== null ? snellen6(v.vision.leftLogMar) : '—'}` : undefined;
  const bodyCallouts: Callout[] = [
    { id: 'eye', label: t('card.eyeFlags'), tone: eyeTone, at: anchors.body.eyes, side: 'left', dy: -22 },
    { id: 'vision', label: t('card.visionRow'), value: visionValue, tone: visionTone, at: anchors.body.eyesRight, side: 'right', dy: -14 },
    { id: 'ear', label: t('card.hearingRow'), tone: hearingTone, at: anchors.body.ear, side: 'left', dy: 26 },
    { id: 'heart', label: t('card.hr'), value: hr ? `${Math.round(hr)} bpm` : undefined, tone: hrTone, at: anchors.body.heart, side: 'right' },
  ];
  const observation = bodyCallouts.find(item => item.id === selectedObservation)!;
  const observationDetails: Record<string, string> = {
    heart: hr ? `${Math.round(hr)} bpm · ${t('face.quality')} ${Math.round(100 * (v.vitals?.quality ?? 0))}%` : t('common.notChecked'),
    ear: v.hearing ? [`${v.hearing.srtDb} dB SNR · ${t('hearing.' + v.hearing.result)}`, v.hearing.tones ? (!v.hearing.tones.reliable ? t('hearing.toneUnreliable') : v.hearing.tones.asymmetry ? t('hearing.toneAsym') : v.hearing.tones.highDrop ? t('hearing.toneDrop') : t('hearing.toneOk')) : '', t('hearing.experimental')].filter(Boolean).join(' · ') : t('common.notChecked'),
    vision: v.vision ? [`${t(v.vision.distanceMm === 2000 ? 'vision.far' : 'vision.near')} · ${t('vision.right')} ${v.vision.rightLogMar == null ? '—' : snellen6(v.vision.rightLogMar)} · ${t('vision.left')} ${v.vision.leftLogMar == null ? '—' : snellen6(v.vision.leftLogMar)}`, visionExtrasLine(v.vision, t)].filter(Boolean).join(' · ') : t('common.notChecked'),
    eye: [`${t('card.pallor')} · ${flagRow(v.eye?.pallor).label}`, `${t('card.jaundice')} · ${jaundice.label}`, `${t('card.cataract')} · ${cataract.label}`].join(' / '),
  };
  const heartCallouts: Callout[] = [
    { id: 'aorta', label: t('card.aorta'), tone: 'none', at: anchors.heart.aorta, side: 'left', dy: -18 },
    { id: 'pa', label: t('card.pulmonary'), tone: 'none', at: anchors.heart.pulmonary, side: 'right' },
    { id: 'vc', label: t('card.venaCava'), tone: 'none', at: anchors.heart.venaCava, side: 'left', dy: 18 },
  ];
  const checks = [v.vitals, v.eye, v.vision, v.hearing, v.symptoms].filter((x) => x != null).length;
  const planned = isOwn ? stepsFor(scan.plan).length : 5;
  const checksTotal = Math.max(planned, checks);
  // Tests not done yet, offered on the citizen's own card. Symptoms are always part of the check.
  const addable = isOwn ? SCREENING_STEPS.filter((st) => st.route !== 'symptoms' && view.triage && (v[st.module] === undefined || v[st.module] === null)) : [];
  const deskGaps = tr.gaps ?? [];
  const scanTime = new Date(scan.startedAt ?? Date.now()).toLocaleTimeString(lang === 'en' ? 'en-IN' : 'hi-IN', { hour: 'numeric', minute: '2-digit' });
  const tiles = [
    { icon: HeartPulse, label: t('card.hr'), value: hr ? String(Math.round(hr)) : '—', unit: hr ? 'BPM' : '', bg: 'bg-[#D8A92B]' },
    { icon: Glasses, label: t('card.visionRow'), value: v.vision?.rightLogMar != null ? snellen6(v.vision.rightLogMar) : '—', unit: v.vision ? 'R' : '', bg: 'bg-[#2FA3C1]' },
    { icon: Ear, label: t('card.hearingRow'), value: v.hearing ? String(v.hearing.srtDb) : '—', unit: v.hearing ? 'dB' : '', bg: 'bg-[#1FB25F]' },
  ];
  const nav = [
    { label: t('card.title'), to: '/card', active: true },
    { label: t('queue.title'), to: '/queue' },
    { label: t('thali.title'), to: '/thali' },
    { label: t('feedback.title'), to: '/feedback' },
  ];
  const card = 'rounded-[28px] bg-white/80 shadow-[0_1px_0_rgba(255,255,255,.9)_inset,0_20px_50px_-30px_rgba(30,40,80,.35)] ring-1 ring-black/[0.04] dark:bg-white/[0.04] dark:ring-white/10';
  const modelFallback = (Icon: typeof HeartPulse) => (
    <div className="flex size-full items-center justify-center text-[#c62a2a]/30">
      <Icon size={96} strokeWidth={0.8} aria-hidden />
    </div>
  );

  return (
    <div className="min-h-dvh bg-[radial-gradient(90%_60%_at_100%_0%,#dfe7ff_0%,transparent_60%),radial-gradient(70%_60%_at_0%_100%,#fde9dc_0%,transparent_60%)] bg-[#eef0f6] px-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] text-[#1d1d1f] sm:px-6 lg:px-10 lg:py-10 paper">
      <div className="mx-auto max-w-[1360px] rounded-[40px] bg-white/45 p-3 ring-1 ring-white/80 backdrop-blur-xl sm:p-5 lg:p-7">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5" aria-label="NikTan">
            <span className="flex size-11 items-center justify-center rounded-full bg-[#1d1d1f]">
              <BrandMark className="size-5 brightness-0 invert" />
            </span>
            <span className="text-title-2 font-semibold">NikTan</span>
          </button>
          <nav className="order-3 -mx-1 flex w-full gap-1.5 overflow-x-auto rounded-full bg-white/70 p-1 no-scrollbar ring-1 ring-black/[0.04] lg:order-none lg:mx-auto lg:w-auto">
            {nav.filter(n => n.active || (isOwn && (n.to !== '/queue' || tr.priority !== 'emergency'))).map((n) => (
              <button key={n.to} onClick={() => !n.active && navigate(n.to)} className={`h-11 shrink-0 rounded-full px-5 text-body font-medium transition-colors ${n.active ? 'bg-[#1d1d1f] text-white' : 'text-[#3a3a3c] hover:bg-black/5'}`}>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <div className="hidden items-center gap-2.5 rounded-full bg-white/70 py-1 pr-4 pl-1 ring-1 ring-black/[0.04] sm:flex">
              <span className="flex size-9 items-center justify-center rounded-full bg-[#e8e8ed] text-caption font-semibold">{v.age}</span>
              <span className="leading-tight">
                <span className="block text-[11px] text-[#6e6e73]">{t('card.patient')}</span>
                <span className="block text-label font-semibold">{t(`info.${v.sex}`)} · {v.age}</span>
              </span>
            </div>
            <button onClick={() => { setSpeechFailed(false); speak(summaryText(), lang, () => setSpeechFailed(true)); }} aria-label={t('common.listen')} className="flex size-11 items-center justify-center rounded-full bg-white/70 ring-1 ring-black/[0.04] hover:bg-white">
              <Volume2 size={18} />
            </button>
            {isOwn && (
              <button onClick={openShare} disabled={busy} aria-label={t('card.share')} className="flex size-11 items-center justify-center rounded-full bg-white/70 ring-1 ring-black/[0.04] hover:bg-white disabled:opacity-50">
                <QrCode size={18} />
              </button>
            )}
          </div>
        </header>

        <motion.main variants={staggerParent} initial={tr.priority === 'emergency' ? false : "hidden"} animate="show" className="mt-5 grid gap-4 lg:mt-7 lg:grid-cols-12 lg:gap-5">
          {/* Verdict, then the one thing to do next */}
          <section className="flex flex-col gap-3 lg:col-span-7">
            {hasResults ? <VerdictBand priority={tr.priority} title={verdictTitle} action={verdictAction} /> : <h1 className={`${card} p-6 text-title-2`}>{verdictTitle}</h1>}
            {tr.priority === 'emergency' && (
              <a href="tel:108" onClick={() => haptic(30)} className="flex h-16 items-center justify-center gap-3 rounded-full bg-emergency text-title-3 font-semibold text-emergency-on shadow-3">
                <PhoneCall size={22} aria-hidden /> {t('card.call108')}
              </a>
            )}
            {isOwn && tr.priority !== 'emergency' && (
              <div className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5`}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#f2f2f5]">
                    <Hospital size={20} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-caption text-[#6e6e73]">{t('card.nextStep')}</p>
                    <p className="text-body-lg font-semibold">{scan.tokenId ? t('card.inQueue') : t('card.joinHint', { dept: pickLang(dept, lang) })}</p>
                  </div>
                </div>
                <button onClick={() => navigate('/queue')} className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d1d1f] px-6 text-body-lg font-semibold text-white sm:h-12">
                  {scan.tokenId ? <Ticket size={18} aria-hidden /> : null}
                  {scan.tokenId ? t('card.viewToken') : t('card.joinQueue')} <ArrowUpRight size={18} aria-hidden />
                </button>
              </div>
            )}
          </section>

          {/* Vital tiles */}
          <motion.section variants={riseChild} className="grid grid-cols-3 gap-2.5 sm:gap-4 lg:col-span-5">
            {tiles.map((tile) => (
              <div key={tile.label} className={`${tile.bg} flex min-h-[120px] min-w-0 flex-col justify-between rounded-[22px] p-3.5 text-[#1d1d1f] shadow-[0_14px_30px_-18px_rgba(0,0,0,.45)] sm:p-5`}>
                <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#1d1d1f] sm:size-9">
                    <tile.icon size={16} strokeWidth={2} aria-hidden />
                  </span>
                  <span className="text-label leading-tight font-medium sm:text-body">{tile.label}</span>
                </div>
                <div className="flex items-end justify-between gap-1">
                  <p className="flex items-baseline gap-1">
                    <span className="tnum truncate text-[clamp(1.15rem,6vw,1.6rem)] leading-none font-semibold sm:text-[2rem]">{tile.value}</span>
                    {tile.unit && <span className="text-[11px] font-semibold">{tile.unit}</span>}
                  </p>
                  <span className="tnum hidden text-caption font-medium xl:block">{isOwn ? scanTime : ''}</span>
                </div>
              </div>
            ))}
          </motion.section>

          {/* Why */}
          <motion.section variants={riseChild} className={`${card} p-6 lg:col-span-12`}>
            <h2 className="flex items-center gap-2 text-label font-semibold text-[#515154]">
              <Stethoscope size={16} aria-hidden /> {t('card.why')}
            </h2>
            <ul className="mt-3 grid gap-x-8 gap-y-2 md:grid-cols-2">
              {tr.reasons.length === 0 && <li className="text-body text-[#6e6e73]">—</li>}
              {tr.reasons.slice(0, 8).map((r) => (
                <li key={r.code} className="flex items-start gap-3 text-body-lg">
                  <ReasonIcon code={r.code} />
                  <span className="pt-1">{pickLang(r, lang)}</span>
                </li>
              ))}
            </ul>
          </motion.section>

          {/* Small cards */}
          <motion.section variants={riseChild} className="grid gap-4 sm:grid-cols-3 lg:col-span-12">
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between">
                <p className="text-body font-medium">{t('card.pallor')}</p>
                <StatusChip status={flagRow(v.eye?.pallor).status} label={flagRow(v.eye?.pallor).label} />
              </div>
              <div className="mt-4 flex flex-col gap-2 text-body">
                {[
                  { l: t('card.jaundice'), c: riskRow(jaundice) },
                  { l: t('card.cataract'), c: riskRow(cataract) },
                ].map((x) => (
                  <div key={x.l} className="flex items-center justify-between gap-2">
                    <span className="truncate text-[#515154]">{x.l}</span>
                    <StatusChip status={x.c.status} label={x.c.label} />
                  </div>
                ))}
              </div>
            </div>
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between">
                <p className="text-body font-medium">{t('card.symptomsRow')}</p>
                <Mic size={18} className="text-[#6e6e73]" aria-hidden />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(v.symptoms?.symptoms ?? []).length === 0 ? (
                  <span className="text-body text-[#6e6e73]">{v.symptoms ? t('symptoms.nothing') : t('common.notChecked')}</span>
                ) : (
                  v.symptoms!.symptoms.map((sy) => {
                    const sv = vocab.get(sy.code);
                    return (
                      <span key={sy.code} className="rounded-full bg-[#f2f2f5] px-3 py-1.5 text-label">
                        {sv ? pickLang(sv, lang) : sy.code}
                        {sy.durationDays ? ` · ${t('symptoms.duration', { n: sy.durationDays })}` : ''}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
            <div className={`${card} flex flex-col gap-3 p-5`}>
              <p className="flex items-center gap-2 text-body font-medium">
                <ClipboardCheck size={18} className="text-[#6e6e73]" aria-hidden /> {t('card.deskTitle')}
              </p>
              {deskGaps.length === 0 ? (
                <p className="text-body text-[#6e6e73]">{t('card.deskNone')}</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-body text-[#3a3a3c]">
                  {deskGaps.slice(0, 4).map((g) => <li key={g.code}>• {pickLang(g, lang)}</li>)}
                </ul>
              )}
            </div>
          </motion.section>

          {addable.length > 0 && (
            <motion.section variants={riseChild} className={`${card} p-5 sm:p-6 lg:col-span-12`}>
              <h2 className="text-title-3 font-semibold">{t('card.addTitle')}</h2>
              <p className="mt-1 text-body text-[#6e6e73]">{t('card.addSub')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {addable.map((st) => {
                  const Icon = { face: HeartPulse, eye: Eye, vision: Glasses, hearing: Ear, symptoms: Mic }[st.route];
                  return (
                    <button key={st.route} onClick={() => navigate(`/scan/${st.route}`)} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-body font-medium hover:bg-[#f2f2f5]">
                      <Plus size={16} aria-hidden /> <Icon size={16} aria-hidden /> {t(`steps.${st.route}`)}
                      <span className="tnum text-caption text-[#6e6e73]">{t('plan.minutes', { n: Math.max(1, Math.round(STEP_MINUTES[st.route])) })}</span>
                    </button>
                  );
                })}
              </div>
            </motion.section>
          )}

          {/* Body map with the checks */}
          <motion.section variants={riseChild} className={`${card} relative overflow-hidden lg:col-span-7`}>
            <div className="relative z-10 flex items-center justify-between p-6 pb-0">
              <div>
                <p className="text-label text-[#6e6e73]">{t('card.bodyMapEyebrow')}</p>
                <h2 className="text-title-2 font-semibold">{t('card.bodyMapTitle')}</h2>
              </div>
              <span className="hidden text-caption text-[#6e6e73] [@media(pointer:fine)]:inline">{t('card.dragToRotate')}</span>
            </div>
            <Suspense fallback={<div className="h-[460px]" />}>
              <AnatomyViewer model="body" selectedId={selectedObservation} onSelect={selectObservation} callouts={bodyCallouts} bpm={hr} className="h-[460px] w-full" fallback={modelFallback(Stethoscope)} />
            </Suspense>
            <div className="px-5 pb-5">
              <div className="flex flex-wrap gap-2">{bodyCallouts.map(item =>
                <button type="button" aria-pressed={item.id === observation.id} key={item.id} onClick={() => selectObservation(item.id)}
                  className={`min-h-11 rounded-full border px-4 text-label ${item.id === observation.id ? 'border-transparent bg-[#1d1d1f] text-white' : 'border-black/10 bg-white text-[#1d1d1f]'}`}>{item.label}</button>
              )}</div>
              <p aria-live="polite" className="mt-3 rounded-md bg-white/80 p-4 text-body"><strong>{observation.label}</strong><br />{observationDetails[observation.id]}</p>
            </div>
          </motion.section>

          {/* Overall screening: anatomical heart */}
          <motion.section variants={riseChild} className={`${card} relative overflow-hidden bg-[radial-gradient(60%_50%_at_50%_62%,#ffe3d6_0%,transparent_70%)] lg:col-span-5`}>
            <div className="relative z-10 flex items-start justify-between p-6 sm:p-7">
              <div>
                <p className="text-title-3 text-[#515154]">{t('card.checkYour')}</p>
                <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] leading-tight font-semibold">{t('card.overall')}</h2>
              </div>
              <div className="text-right">
                <p className="tnum text-[clamp(2rem,3.5vw,2.75rem)] leading-none font-semibold tracking-tight">
                  {checks}<span className="text-[0.55em] text-[#8e8e93]">/{checksTotal}</span>
                </p>
                <span className={`mt-2 inline-block rounded-full px-3 py-1 text-caption font-semibold ${PRIORITY_META[tr.priority].solid}`}>{t('card.checksDone', { n: checks, total: checksTotal })}</span>
              </div>
            </div>
            <Suspense fallback={<div className="h-[440px] lg:h-[560px]" />}>
              <AnatomyViewer model="heart" callouts={heartCallouts} bpm={hr} className="-mt-6 h-[440px] w-full lg:h-[560px]" fallback={modelFallback(HeartPulse)} />
            </Suspense>
            <p className="absolute right-5 bottom-4 left-5 text-[10px] text-[#8e8e93]">3D anatomy: BodyParts3D © DBCLS, CC BY 4.0</p>
          </motion.section>

          <motion.div variants={riseChild} className="flex flex-col gap-3 lg:col-span-12">
            <Disclaimer />
            {speechFailed && <p role="status" className="text-body text-[#515154]">{t('card.speechUnavailable')}</p>}
            {error && <p role="alert" className="text-body text-emergency-text">{t('card.syncError')}</p>}
            {isOwn && (
              <button onClick={() => { setError(false); setConfirmDelete(true); }} className="mx-auto inline-flex min-h-12 items-center gap-2 text-body text-[#6e6e73] hover:text-emergency-text">
                <Trash2 size={18} aria-hidden /> {t('card.delete')}
              </button>
            )}
          </motion.div>
        </motion.main>
      </div>

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
    </div>
  );
}
