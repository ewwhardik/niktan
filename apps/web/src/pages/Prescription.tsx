import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Camera, ChevronDown, ExternalLink, ImagePlus, Pill, PiggyBank, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { shrink } from '../lib/photo';
import { Button, LinkButton } from '../ui/Button';
import { Dock, Screen, TopBar } from '../ui/Layout';
import { riseChild, staggerParent } from '../ui/motion';
import { GenericList, type Dataset, type Generic } from './rx/Generics';
import { LabReport } from './rx/LabReport';
import { MedicineSaver } from './rx/MedicineSaver';
import { ToolTabs, useTool } from './rx/ToolTabs';

interface Medicine {
  name: string;
  /** Set by the server when the written name is a brand it knows; the generic came from its dictionary. */
  knownBrand?: boolean;
  generic?: string | null;
  strength?: string | null;
  form?: string | null;
  dose?: string | null;
  frequency?: string | null;
  timing?: string | null;
  duration?: string | null;
  source?: string;
  conflicts?: string[];
  confidence: number;
  unclear: boolean;
}

interface Reading {
  notPrescription: boolean;
  medicines: Medicine[];
  advice: string[];
  adviceNeedsReview?: boolean;
  unreadable?: string[];
}

interface Info {
  ingredient: string | null;
  found: boolean;
  uses: string | null;
  warnings: string | null;
  doNotUse: string | null;
  sideEffects: string | null;
  sources: { name: string; url: string }[];
}

type Phase = 'photo' | 'review' | 'reading' | 'result' | 'error';

function MedicineCard({ m, index }: { m: Medicine; index: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null | 'loading' | 'error'>(null);
  const [cheaper, setCheaper] = useState<{ generics: Generic[]; dataset: Dataset } | 'loading' | 'error' | null>(null);
  async function findCheaper() {
    if (cheaper && cheaper !== 'error') return setCheaper(null);
    setCheaper('loading');
    try {
      setCheaper(await api.post<{ generics: Generic[]; dataset: Dataset }>('/api/meds/generics', { generic: m.generic || m.name, strength: m.strength ?? null, form: m.form ?? null }));
    } catch {
      setCheaper('error');
    }
  }
  async function toggle() {
    setOpen((v) => !v);
    if (open || (info && info !== 'error')) return;
    setInfo('loading');
    try {
      const query = m.generic || m.name.replace(/^(tab|cap|syp|inj|oint|drops?)\.?\s+/i, '');
      setInfo(await api.get<Info>(`/api/rx/info?name=${encodeURIComponent(query)}`));
    } catch {
      setInfo('error');
    }
  }

  return (
    <motion.li variants={riseChild} className="overflow-hidden rounded-[24px] bg-surface shadow-1 ring-1 ring-border">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sunken text-label font-semibold">{index + 1}</span>
          <div className="min-w-0 flex-1 break-words">
            <p className="text-title-3 font-semibold">{m.name}</p>
            {m.generic && !m.conflicts?.includes('generic') && <p className="text-body text-text-2">{m.generic}</p>}
            {m.knownBrand && <p className="text-caption text-text-3">{t('rx.fromDictionary')}</p>}
          </div>
          {m.unclear && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-seetoday-tint px-2.5 py-1 text-caption font-medium text-seetoday-ink">
              <AlertTriangle size={12} aria-hidden /> {t('rx.check')}
            </span>
          )}
        </div>
        {m.source && <blockquote className="mt-3 border-l-2 border-border pl-3 text-body text-text-2" dir="auto">{m.source}</blockquote>}
        {m.unclear && (
          <p className="mt-3 rounded-xl bg-seetoday-tint p-3 text-body text-seetoday-ink">
            {t('rx.confirmLine')} {m.conflicts?.map(k => t(`rx.fields.${k}`)).join(', ')}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {(['strength', 'form', 'dose', 'frequency', 'timing', 'duration'] as const).map(k => (
            <div key={k}>
              <dt className="text-caption text-text-3">{t(`rx.fields.${k}`)}</dt>
              <dd className="text-body">{m.conflicts?.includes(k) ? t('rx.check') : m[k] || t('rx.unspecified')}</dd>
            </div>
          ))}
        </dl>
      </div>
      {!m.unclear && <>
        {(m.generic || m.knownBrand) && (
          <div className="border-t border-border">
            <button onClick={() => void findCheaper()} aria-expanded={!!cheaper && cheaper !== 'error'} className="flex w-full items-center justify-between px-5 py-3.5 text-left text-label font-medium text-routine-ink">
              {t('saver.findCheaper')}
              <PiggyBank size={18} aria-hidden />
            </button>
            {cheaper && (
              <div className="px-5 pb-5">
                {cheaper === 'loading' ? <div className="skeleton h-14 rounded-2xl" /> : cheaper === 'error' ? <p className="text-body text-text-2">{t('saver.failed')}</p> : <GenericList generics={cheaper.generics} dataset={cheaper.dataset} compact />}
              </div>
            )}
          </div>
        )}
        <button onClick={() => void toggle()} aria-expanded={open} className="flex w-full items-center justify-between border-t border-border px-5 py-3.5 text-left text-label font-medium text-[#0071e3] dark:text-[#2997ff]">
          {t('rx.about')}
          <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={18} aria-hidden /></motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
              <div className="flex flex-col gap-3 px-5 pb-5 text-body">
                {info === 'loading' && <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-4 rounded" style={{ width: `${90 - i * 18}%` }} />)}</div>}
                {info === 'error' && <p className="text-text-2">{t('rx.infoError')}</p>}
                {info && typeof info === 'object' && (
                  <>
                    {info.ingredient && <p className="text-caption text-text-3">{t('rx.ingredient')}: {info.ingredient}</p>}
                    {!info.found && <p className="text-text-2">{t('rx.notFound')}</p>}
                    {[
                      [t('rx.uses'), info.uses],
                      [t('rx.warnings'), info.warnings],
                      [t('rx.doNotUse'), info.doNotUse],
                      [t('rx.sideEffects'), info.sideEffects],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-label font-semibold">{label}</p>
                        <p className="mt-0.5 text-text-2">{value}</p>
                      </div>
                    ))}
                    {!!info.sources.length && (
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-text-3">
                        {t('rx.source')}:{' '}
                        {info.sources.map((s) => (
                          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">{s.name} <ExternalLink size={11} aria-hidden /></a>
                        ))}
                      </p>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>}
    </motion.li>
  );
}

/** The prescription page hosts three paper tools; each opens on its own via ?tool=. */
export default function RxHub() {
  const navigate = useNavigate();
  const [tool] = useTool();
  const { t } = useTranslation();
  const exit = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }));
  return (
    <Screen aside={t(`tools.aside.${tool}`)}>
      {tool === 'saver' ? <MedicineSaver key="saver" onExit={exit} /> : tool === 'lab' ? <LabReport key="lab" onExit={exit} /> : <PrescriptionReader key="rx" onExit={exit} />}
    </Screen>
  );
}

/** Reads a photographed prescription, handwriting included, and explains each medicine. */
function PrescriptionReader({ onExit }: { onExit: () => void }) {
  const { t, i18n } = useTranslation();
  const camInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('photo');
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string>('');

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  function reset() {
    pending.current?.abort();
    setPhoto(null);
    setFile(null);
    setText('');
    setError('');
    setReading(null);
    setPhase('photo');
  }

  function onFile(input: HTMLInputElement) {
    const next = input.files?.[0];
    input.value = '';
    if (!next) return;
    setFile(next);
    setPhoto(URL.createObjectURL(next));
    setText('');
    setPhase('review');
  }

  async function read() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setPhase('reading');
    const form = new FormData();
    form.set('language', i18n.language);
    try {
      if (file && photo) {
        const blob = await shrink(file, photo, 2400, 0.92);
        form.set('photo', blob, 'prescription.jpg');
      } else form.set('text', text.trim());
      if (controller.signal.aborted) return;
      const res = await api.post<Reading>('/api/rx/read', form, controller.signal);
      if (controller.signal.aborted) return;
      setReading(res);
      setPhase('result');
    } catch (e) {
      if (controller.signal.aborted) return;
      let message = 'rx.decode';
      if (e instanceof ApiError) {
        message = 'rx.failed';
        if (e.status === 429) message = 'rx.tooMany';
        if (e.status === 413) message = 'rx.tooLarge';
      }
      setError(t(message));
      setPhase('error');
    }
  }

  function back() {
    if (phase === 'photo') onExit();
    else if (phase === 'reading' || phase === 'error' || phase === 'result') {
      pending.current?.abort();
      setPhase('review');
    } else reset();
  }

  return (
    <>
      <TopBar onBack={back} title={t('rx.title')} />
      <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.currentTarget)} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.currentTarget)} />

      <AnimatePresence mode="wait">
        {phase === 'photo' && (
          <motion.div key="photo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col gap-6 pt-2">
            <ToolTabs />
            <div>
              <h1 className="text-title-1 font-semibold lg:text-[2.5rem] lg:leading-tight">{t('rx.heading')}</h1>
              <p className="mt-2 text-body-lg text-text-2">{t('rx.intro')}</p>
            </div>
            <PaperIllustration />
            <ul className="flex flex-col gap-2 text-body text-text-2">
              {(t('rx.tips', { returnObjects: true }) as string[]).map((tip) => (
                <li key={tip} className="flex gap-2.5"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-text-3" />{tip}</li>
              ))}
            </ul>
          </motion.div>
        )}

        {['review', 'reading', 'error'].includes(phase) && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col gap-4 pt-4">
            <h1 className="text-title-1 font-semibold">{t(photo ? 'rx.reviewPhoto' : 'rx.paste')}</h1>
            {photo ? <img src={photo} alt={t('rx.photoAlt')} className="max-h-[50svh] w-full rounded-2xl bg-sunken object-contain" /> :
              <textarea autoFocus aria-label={t('rx.paste')} maxLength={12000} rows={8} disabled={phase === 'reading'} value={text} onChange={e => setText(e.target.value)} className="rounded-2xl border border-border bg-surface p-4 text-body" />}
            {phase === 'reading' ? <p role="status">{t('rx.reading')}</p> : <p className="text-body text-text-2">{t('rx.share')}</p>}
            {phase === 'error' && <p role="alert" className="rounded-2xl bg-seetoday-tint p-4 text-body text-seetoday-ink">{error}</p>}
          </motion.div>
        )}

        {phase === 'result' && reading && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 pt-4">
            {reading.notPrescription || (!reading.medicines.length && !reading.advice.length) ? (
              <p className="rounded-2xl bg-seetoday-tint px-4 py-3 text-body-lg text-seetoday-ink">{t(reading.notPrescription ? 'rx.unrelated' : 'rx.none')}</p>
            ) : reading.medicines.length > 0 && (
              <>
                <div>
                  <h1 className="text-title-1 font-semibold">{t('rx.found', { count: reading.medicines.length })}</h1>
                  <p className="mt-1 text-body text-text-2">{t('rx.verify')}</p>
                </div>
                <motion.ol variants={staggerParent} initial="hidden" animate="show" className="flex flex-col gap-3">
                  {reading.medicines.map((m, i) => <MedicineCard key={`${m.name}-${i}`} m={m} index={i} />)}
                </motion.ol>
              </>
            )}
            {!!reading.advice.length && (
              <div className="rounded-[24px] bg-sunken p-5">
                <p className="text-label font-semibold">{t('rx.advice')}</p>
                {reading.adviceNeedsReview && <p className="mt-2 text-label font-medium text-seetoday-ink">{t('rx.reviewAdvice')}</p>}
                <ul className="mt-2 flex flex-col gap-1.5 text-body text-text-2">
                  {reading.advice.map((a) => <li key={a}>• {a}</li>)}
                </ul>
              </div>
            )}
            {!!reading.unreadable?.length && <section className="rounded-2xl bg-seetoday-tint p-4"><h2 className="font-semibold">{t('rx.unclearLines')}</h2><ul>{reading.unreadable.map((line, i) => <li key={i}>{line}</li>)}</ul></section>}
            <details className="rounded-2xl border border-border p-4"><summary className="cursor-pointer font-medium">{t('rx.original')}</summary>
              {photo ? <img src={photo} alt={t('rx.photoAlt')} className="mt-3 w-full" /> : <p className="mt-3 whitespace-pre-wrap break-words">{text}</p>}
            </details>
            <p className="text-caption text-text-3">{t('rx.disclaimer')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Dock>
        {phase === 'reading' ? (
          <Button loading>{t('rx.reading')}</Button>
        ) : phase === 'photo' ? (
          <>
            <Button icon={Camera} onClick={() => camInput.current?.click()}>{t('rx.take')}</Button>
            <LinkButton onClick={() => fileInput.current?.click()} className="inline-flex items-center justify-center gap-2"><ImagePlus size={16} aria-hidden /> {t('rx.choose')}</LinkButton>
            <div className="grid grid-cols-2 gap-2">
              <LinkButton onClick={() => setPhase('review')}>{t('tools.paste')}</LinkButton>
              <LinkButton onClick={() => { setText(t('rx.sampleText')); setPhase('review'); }} className="inline-flex items-center justify-center gap-2"><Sparkles size={16} aria-hidden /> {t('tools.sample')}</LinkButton>
            </div>
          </>
        ) : phase === 'review' || phase === 'error' ? (
          <>
            <Button disabled={!file && !text.trim()} onClick={() => void read()}>{t('rx.read')}</Button>
            <LinkButton onClick={reset}>{t('rx.change')}</LinkButton>
          </>
        ) : (
          <Button variant="secondary" icon={RefreshCw} onClick={reset}>{t('rx.another')}</Button>
        )}
      </Dock>
    </>
  );
}

/** A prescription slip with handwriting that writes itself, then a scan line resolving it to text. */
function PaperIllustration() {
  const lines = ['M14 34c10-6 18 4 28-2s16 6 26 0 14 4 24-1', 'M14 58c8-5 14 3 22-1s12 5 20 0 18 3 30-2', 'M14 82c12-4 20 4 30-1s10 4 18 0'];
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[360px] [perspective:900px]">
      <motion.div initial={{ rotateX: 18, rotateZ: -4, y: 12, opacity: 0 }} animate={{ rotateX: 8, rotateZ: -3, y: 0, opacity: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-[6%] rounded-[18px] bg-[#fbfaf6] p-4 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_24px_50px_-24px_rgb(0_0_0/0.35)] ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-black/10 pb-2 text-[11px] text-black/45"><span>Dr. ———</span><Pill size={14} aria-hidden /></div>
        <svg viewBox="0 0 140 100" className="mt-1 h-[78%] w-full" aria-hidden>
          <text x="2" y="16" fontSize="14" fontStyle="italic" fill="#1f2a6b">℞</text>
          {lines.map((d, i) => (
            <motion.path key={d} d={d} fill="none" stroke="#1f2a6b" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.5 + i * 0.5, ease: 'easeInOut' }} />
          ))}
        </svg>
      </motion.div>
      <motion.div className="absolute inset-x-[8%] h-[2px] rounded-full bg-[#0071e3]" initial={{ top: '12%', opacity: 0 }} animate={{ top: ['12%', '86%', '12%'], opacity: 1 }} transition={{ duration: 3.4, delay: 2, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  );
}
