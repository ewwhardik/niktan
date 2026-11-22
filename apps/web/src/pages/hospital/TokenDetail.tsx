import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, HeartPulse, Play, Save, Square } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { departments, symptoms as VOCAB, type DepartmentId, type EyeFlags, type Hearing, type Priority, type Symptoms, type TriageResult, type Vision, type Vitals } from '@niktan/core';
import { pickLang } from '../../i18n';
import { api } from '../../lib/api';
import { snellen6 } from '../../tests/vision';
import { Button } from '../../ui/Button';
import { PRIORITY_META, SimBadge } from '../../ui/Chip';
import { riseChild, staggerParent } from '../../ui/motion';
import { useStaff } from './staff';

interface Detail {
  token: { id: string; number: number; status: string; priority: Priority; created_at: number; consult_start: number | null; simulated: number; code: string };
  card: {
    session: { age: number; sex: string; pregnant: boolean };
    vitals: Vitals | null;
    eye: EyeFlags | null;
    vision: Vision | null;
    hearing: Hearing | null;
    symptoms: Symptoms | null;
    triage: TriageResult;
  } | null;
  note: { note: string; history_prefilled_useful: number | null } | null;
}

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="tnum">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

export default function TokenDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const staff = useStaff();
  const [d, setD] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const [useful, setUseful] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const r = await api.get<Detail>(`/api/hospital/tokens/${id}`).catch(() => null);
    if (r) {
      setD(r);
      setNote((n) => n || r.note?.note || '');
      setUseful((u) => u ?? (r.note?.history_prefilled_useful == null ? null : !!r.note.history_prefilled_useful));
    }
  }, [id]);
  useEffect(() => {
    if (staff) void load();
  }, [staff, load]);

  if (!d?.card) return <div className="mx-auto max-w-3xl p-5"><div className="skeleton h-64 rounded-xl" /></div>;
  const { token, card } = d;
  const meta = PRIORITY_META[card.triage.priority];
  const vocab = new Map(VOCAB.map((s) => [s.code, s]));
  const canNote = staff?.role === 'doctor' || staff?.role === 'admin';

  const transition = async (a: 'start' | 'end') => {
    await api.post(`/api/hospital/tokens/${token.id}/${a}`).catch(() => undefined);
    if (a === 'end') {
      if (canNote) await api.put(`/api/hospital/tokens/${token.id}/note`, { note, historyPrefilledUseful: useful }).catch(() => undefined);
      navigate('/hospital/board');
    } else void load();
  };

  const kv = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-body text-text-2">{label}</span>
      <span className="tnum text-right text-body-lg font-medium">{value}</span>
    </div>
  );
  const flag = (v: boolean | null | undefined) => (v == null ? <span className="text-text-3">—</span> : v ? <span className="text-seetoday-text">{t('card.checkFlag')}</span> : t('card.normal'));

  return (
    <div className="min-h-dvh bg-bg">
      <header className="glass sticky top-0 z-20 border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <button onClick={() => navigate('/hospital/board')} aria-label={t('common.back')} className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-sunken">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-title-3 font-semibold">{t('hospital.preConsult')}</h1>
          {token.status === 'in_consult' && token.consult_start && (
            <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-label font-medium text-accent-soft-ink">
              <motion.span className="size-2 rounded-full bg-accent" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
              <Timer since={token.consult_start} />
            </span>
          )}
        </div>
      </header>

      <motion.main variants={staggerParent} initial="hidden" animate="show" className="mx-auto grid max-w-3xl gap-4 px-5 py-5 md:grid-cols-2">
        <motion.section variants={riseChild} className={`verdict-glow rounded-xl p-5 md:col-span-2 ${meta.solid}`} style={{ ['--verdict' as string]: meta.cssVar, ['--glow' as string]: 1 }}>
          <div className="flex items-center justify-between">
            <span className="tnum text-display font-semibold">#{token.number}</span>
            {!!token.simulated && <SimBadge />}
          </div>
          <p className="mt-1 flex items-center gap-2 text-title-3 font-semibold">
            <meta.icon size={22} aria-hidden /> {t(`card.${card.triage.priority}`)} · {pickLang(departments[token.code as DepartmentId] ?? departments.medicine, lang)}
          </p>
          <p className="mt-1 text-body-lg opacity-90">
            {card.session.age} · {card.session.sex}
            {card.session.pregnant ? ` · ${lang === 'en' ? 'pregnant' : 'गर्भवती'}` : ''}
          </p>
        </motion.section>

        <motion.section variants={riseChild} className="rounded-lg bg-surface p-5 shadow-1">
          <h2 className="text-label font-semibold text-text-2">{t('card.why')}</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {card.triage.reasons.map((r) => (
              <li key={r.code} className="text-body-lg">• {pickLang(r, lang)}</li>
            ))}
            {!card.triage.reasons.length && <li className="text-body text-text-3">—</li>}
          </ul>
          <h2 className="mt-5 text-label font-semibold text-text-2">{t('card.symptomsRow')}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(card.symptoms?.symptoms ?? []).map((s) => (
              <span key={s.code} className="rounded-full bg-sunken px-2.5 py-1 text-caption">
                {pickLang(vocab.get(s.code) ?? { hi: s.code, en: s.code }, lang)}
                {s.durationDays ? ` · ${s.durationDays}d` : ''}
                {s.severity === 'severe' ? ' · !' : ''}
              </span>
            ))}
          </div>
          {card.symptoms?.summaryHi && <p className="mt-3 rounded-md bg-sunken p-3 text-body text-text-2">“{card.symptoms.summaryHi}”</p>}
        </motion.section>

        <motion.section variants={riseChild} className="divide-y divide-border rounded-lg bg-surface px-5 py-2 shadow-1">
          {kv(
            t('card.hr'),
            card.vitals ? (
              <span className="inline-flex items-center gap-1.5">
                <HeartPulse size={16} className="text-emergency-text" aria-hidden /> {Math.round(card.vitals.heartRate)}
                <span className="text-caption text-text-3">q {Math.round(card.vitals.quality * 100)}%</span>
              </span>
            ) : (
              '—'
            ),
          )}
          {kv(t('card.pallor'), card.eye ? <>{flag(card.eye.pallor)}{card.eye.pallorScore != null && <span className="ml-1.5 text-caption text-text-3">p {card.eye.pallorScore.toFixed(2)}</span>}</> : '—')}
          {kv(t('card.jaundice'), flag(card.eye?.jaundice))}
          {kv(t('card.cataract'), flag(card.eye?.cataract))}
          {kv(t('card.visionRow'), card.vision ? `R ${card.vision.rightLogMar != null ? snellen6(card.vision.rightLogMar) : '—'} · L ${card.vision.leftLogMar != null ? snellen6(card.vision.leftLogMar) : '—'}` : '—')}
          {kv(t('card.hearingRow'), card.hearing ? `${card.hearing.result === 'pass' ? t('card.normal') : t('card.refer')} (${card.hearing.srtDb} dB)` : '—')}
        </motion.section>

        {canNote && (
          <motion.section variants={riseChild} className="rounded-lg bg-surface p-5 shadow-1 md:col-span-2">
            <label className="text-label font-semibold text-text-2" htmlFor="note">
              {t('hospital.notes')}
            </label>
            <textarea id="note" value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} rows={4} className="mt-2 w-full rounded-sm border border-border-strong bg-sunken p-3 outline-none focus:border-accent" />
            <p className="mt-4 text-body">{t('hospital.useful')}</p>
            <div className="mt-2 flex gap-2">
              {[true, false].map((v) => (
                <button key={String(v)} onClick={() => setUseful(v)} className={`min-h-11 flex-1 rounded-md border text-label ${useful === v ? 'border-transparent bg-accent-soft text-accent-soft-ink' : 'border-border'}`}>
                  {v ? t('info.yes') : t('info.no')}
                </button>
              ))}
            </div>
            <button
              onClick={async () => {
                await api.put(`/api/hospital/tokens/${token.id}/note`, { note, historyPrefilledUseful: useful }).catch(() => undefined);
                setSaved(true);
              }}
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-label text-accent-text"
            >
              {saved ? <CheckCircle2 size={16} /> : <Save size={16} />} {t('hospital.save')}
            </button>
          </motion.section>
        )}

        {!token.simulated && (
          <motion.div variants={riseChild} className="md:col-span-2">
            {token.status === 'in_consult' ? (
              <Button icon={Square} onClick={() => transition('end')}>
                {t('hospital.end')}
              </Button>
            ) : token.status === 'waiting' || token.status === 'called' ? (
              <Button icon={Play} onClick={() => transition('start')}>
                {t('hospital.start')}
              </Button>
            ) : null}
          </motion.div>
        )}
      </motion.main>
    </div>
  );
}
