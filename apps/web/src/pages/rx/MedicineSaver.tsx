import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Camera, CalendarClock, ImagePlus, RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { Button, LinkButton } from '../../ui/Button';
import { Dock, TopBar } from '../../ui/Layout';
import { GenericList, type Dataset, type Generic } from './Generics';
import { ToolTabs } from './ToolTabs';
import { usePhoto } from './usePhoto';

interface Pack {
  notMedicine?: boolean;
  brand?: string | null;
  composition?: string | null;
  strength?: string | null;
  form?: string | null;
  packSize?: string | null;
  mrp?: number | null;
  expiry?: string | null;
  expiryMonth: string | null;
  manufacturer?: string | null;
  compositionSource?: 'label' | 'brandList' | null;
}

type Phase = 'start' | 'review' | 'reading' | 'result' | 'error';

/** "2026-11" -> expired after the last day of November 2026; "soon" within 60 days. */
export function expiryStatus(month: string | null, today = new Date()): 'expired' | 'soon' | 'ok' | null {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  const end = new Date(y!, m!, 0, 23, 59, 59);
  if (end < today) return 'expired';
  return end.getTime() - today.getTime() < 60 * 86_400_000 ? 'soon' : 'ok';
}

/** Photograph a strip or type a name; see the Jan Aushadhi generic and what it costs. */
export function MedicineSaver({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  const photo = usePhoto();
  const [phase, setPhase] = useState<Phase>('start');
  const [pack, setPack] = useState<Pack | null>(null);
  const [generics, setGenerics] = useState<Generic[]>([]);
  const [dataset, setDataset] = useState<Dataset | undefined>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Generic[] | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  // Search the list as the user types; the list is public, so this needs no AI.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    const id = window.setTimeout(() => {
      api.get<{ results: Generic[]; dataset: Dataset }>(`/api/meds/search?q=${encodeURIComponent(q)}`)
        .then((r) => { setResults(r.results); setDataset(r.dataset); })
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(id);
  }, [query]);

  function reset() {
    pending.current?.abort();
    photo.clear();
    setPack(null);
    setGenerics([]);
    setError('');
    setPhase('start');
  }

  async function read() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setPhase('reading');
    try {
      const blob = await photo.blob();
      if (!blob || controller.signal.aborted) return;
      const form = new FormData();
      form.set('photo', blob, 'pack.jpg');
      const res = await api.post<{ pack: Pack; generics: Generic[]; dataset: Dataset }>('/api/meds/read', form, controller.signal);
      if (controller.signal.aborted) return;
      setPack(res.pack);
      setGenerics(res.generics);
      setDataset(res.dataset);
      setPhase('result');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(t(e instanceof ApiError ? (e.status === 429 ? 'saver.tooMany' : 'saver.failed') : 'rx.decode'));
      setPhase('error');
    }
  }

  const back = () => (phase === 'start' ? onExit() : phase === 'result' ? reset() : (pending.current?.abort(), phase === 'review' ? reset() : setPhase('review')));
  const expiry = expiryStatus(pack?.expiryMonth ?? null);

  return (
    <>
      <TopBar onBack={back} title={t('tools.saver')} />
      <input ref={photo.camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => photo.pick(e.currentTarget) && setPhase('review')} />
      <input ref={photo.gallery} type="file" accept="image/*" hidden onChange={(e) => photo.pick(e.currentTarget) && setPhase('review')} />
      <AnimatePresence mode="wait">
        {phase === 'start' && (
          <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col gap-6 pt-2">
            <ToolTabs />
            <div>
              <h1 className="text-title-1 font-semibold lg:text-[2.5rem] lg:leading-tight">{t('saver.heading')}</h1>
              <p className="mt-2 text-body-lg text-text-2">{t('saver.intro')}</p>
            </div>
            <StripIllustration />
            <label className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 shadow-1 focus-within:ring-2 focus-within:ring-accent">
              <Search size={18} className="shrink-0 text-text-3" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('saver.searchPlaceholder')} aria-label={t('saver.search')} className="min-w-0 flex-1 bg-transparent py-3 text-body outline-none" />
            </label>
            {results && <GenericList generics={results} dataset={dataset} compact />}
            <ul className="flex flex-col gap-2 text-body text-text-2">
              {(t('saver.tips', { returnObjects: true }) as string[]).map((tip) => (
                <li key={tip} className="flex gap-2.5"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-text-3" />{tip}</li>
              ))}
            </ul>
          </motion.div>
        )}

        {['review', 'reading', 'error'].includes(phase) && photo.url && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col gap-4 pt-4">
            <h1 className="text-title-1 font-semibold">{t('saver.review')}</h1>
            <img src={photo.url} alt={t('saver.photoAlt')} className="max-h-[50svh] w-full rounded-2xl bg-sunken object-contain" />
            {phase === 'reading' ? <p role="status">{t('saver.reading')}</p> : <p className="text-body text-text-2">{t('saver.share')}</p>}
            {phase === 'error' && <p role="alert" className="rounded-2xl bg-seetoday-tint p-4 text-body text-seetoday-ink">{error}</p>}
          </motion.div>
        )}

        {phase === 'result' && pack && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 pt-4">
            {pack.notMedicine ? (
              <p className="rounded-2xl bg-seetoday-tint px-4 py-3 text-body-lg text-seetoday-ink">{t('saver.unrelated')}</p>
            ) : (
              <>
                <section className="rounded-[24px] bg-surface p-5 shadow-1 ring-1 ring-border">
                  <p className="text-caption tracking-[0.12em] text-text-3 uppercase">{t('saver.youHave')}</p>
                  <p className="mt-1 text-title-2 font-semibold break-words">{pack.brand || t('saver.unknownBrand')}</p>
                  <p className="mt-1 text-body text-text-2 break-words">{pack.composition || t('saver.noComposition')}</p>
                  {pack.compositionSource === 'brandList' && <p className="mt-0.5 text-caption text-text-3">{t('rx.fromDictionary')}</p>}
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    {([['form', pack.form], ['packSize', pack.packSize], ['mrp', pack.mrp != null ? `₹${pack.mrp}` : null], ['maker', pack.manufacturer]] as const).map(([k, v]) => (
                      <div key={k}><dt className="text-caption text-text-3">{t(`saver.fields.${k}`)}</dt><dd className="text-body">{v || '—'}</dd></div>
                    ))}
                  </dl>
                  {expiry && (
                    <p className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-body ${expiry === 'expired' ? 'bg-emergency-tint text-emergency-ink' : expiry === 'soon' ? 'bg-seetoday-tint text-seetoday-ink' : 'bg-routine-tint text-routine-ink'}`}>
                      {expiry === 'ok' ? <CalendarClock size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
                      {t(`saver.expiry.${expiry}`, { date: pack.expiry })}
                    </p>
                  )}
                </section>
                <div>
                  <h2 className="text-title-3 font-semibold">{t('saver.genericTitle')}</h2>
                  <p className="mt-1 text-body text-text-2">{t('saver.genericBody')}</p>
                </div>
                {pack.composition ? <GenericList generics={generics} dataset={dataset} /> : <p className="rounded-2xl bg-sunken p-4 text-body text-text-2">{t('saver.typeInstead')}</p>}
              </>
            )}
            <details className="rounded-2xl border border-border p-4"><summary className="cursor-pointer font-medium">{t('rx.original')}</summary>
              {photo.url && <img src={photo.url} alt={t('saver.photoAlt')} className="mt-3 w-full" />}
            </details>
            <p className="text-caption text-text-3">{t('saver.disclaimer')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Dock>
        {phase === 'reading' ? <Button loading>{t('saver.reading')}</Button>
          : phase === 'start' ? (
            <>
              <Button icon={Camera} onClick={() => photo.camera.current?.click()}>{t('saver.take')}</Button>
              <LinkButton onClick={() => photo.gallery.current?.click()} className="inline-flex items-center justify-center gap-2"><ImagePlus size={16} aria-hidden /> {t('rx.choose')}</LinkButton>
            </>
          ) : phase === 'review' || phase === 'error' ? (
            <>
              <Button onClick={() => void read()}>{t('saver.read')}</Button>
              <LinkButton onClick={reset}>{t('rx.change')}</LinkButton>
            </>
          ) : <Button variant="secondary" icon={RefreshCw} onClick={reset}>{t('saver.another')}</Button>}
      </Dock>
    </>
  );
}

/** A blister strip whose price tag flips from the brand MRP to the generic one. */
function StripIllustration() {
  return (
    <div className="relative mx-auto aspect-[16/9] w-full max-w-[360px]" aria-hidden>
      <motion.div initial={{ rotate: -6, y: 10, opacity: 0 }} animate={{ rotate: -4, y: 0, opacity: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-[8%] top-[14%] bottom-[18%] grid grid-cols-5 grid-rows-2 gap-2 rounded-[18px] bg-[linear-gradient(135deg,#eef1f4,#d9dee4)] p-3 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.35)] ring-1 ring-black/5 dark:bg-[linear-gradient(135deg,#3a3d42,#26282c)]">
        {Array.from({ length: 10 }, (_, i) => (
          <motion.span key={i} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 + i * 0.05 }} className="rounded-full bg-white shadow-[inset_0_-2px_4px_rgb(0_0_0/0.12)] dark:bg-[#cfd3d8]" />
        ))}
      </motion.div>
      <motion.div initial={{ rotateY: 0 }} animate={{ rotateY: [0, 0, 180, 180] }} transition={{ duration: 4, times: [0, 0.35, 0.5, 1], repeat: Infinity, repeatDelay: 1.2 }}
        className="absolute right-[4%] bottom-[4%] [transform-style:preserve-3d]">
        <span className="tnum block rounded-full bg-surface px-3 py-1.5 text-label font-semibold text-text-2 shadow-1 ring-1 ring-border [backface-visibility:hidden]"><s>₹120</s></span>
        <span className="tnum absolute inset-0 block rounded-full bg-routine px-3 py-1.5 text-center text-label font-semibold text-routine-on [backface-visibility:hidden] [transform:rotateY(180deg)]">₹18</span>
      </motion.div>
    </div>
  );
}
