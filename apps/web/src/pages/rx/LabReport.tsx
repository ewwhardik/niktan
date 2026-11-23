import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Camera, ChevronDown, ImagePlus, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { Button, LinkButton } from '../../ui/Button';
import { Dock, TopBar } from '../../ui/Layout';
import { riseChild, staggerParent } from '../../ui/motion';
import { ToolTabs } from './ToolTabs';
import { usePhoto } from './usePhoto';

type Flag = 'low' | 'high' | 'normal' | null;
interface Test {
  name: string;
  value: string;
  unit: string | null;
  range: string | null;
  section: string | null;
  flag: Flag;
  flagSource: 'range' | 'report' | 'typical' | null;
  urgent: boolean;
  what: string | null;
  note: string | null;
}
interface Report {
  notLabReport?: boolean;
  lab?: string | null;
  date?: string | null;
  tests: Test[];
  counts?: { low: number; high: number; normal: number; unknown: number };
  urgent?: boolean;
}

type Phase = 'start' | 'review' | 'reading' | 'result' | 'error';

const FLAG_STYLE: Record<'low' | 'high' | 'normal', string> = {
  low: 'bg-seetoday-tint text-seetoday-ink',
  high: 'bg-seetoday-tint text-seetoday-ink',
  normal: 'bg-routine-tint text-routine-ink',
};

const num = (v: string) => Number(v.replace(/,/g, '').match(/-?[0-9]+(?:\.[0-9]+)?/)?.[0]);

/** Where the value sits against the printed range, drawn only when both ends are numbers. */
function RangeBar({ value, range, flag }: { value: string; range: string | null; flag: Flag }) {
  const m = range?.replace(/,(?=\d{3})/g, '').replace(/[–—]/g, '-').match(/([0-9]+(?:\.[0-9]+)?)\s*-\s*([0-9]+(?:\.[0-9]+)?)/);
  const v = num(value);
  if (!m || !Number.isFinite(v)) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  const span = hi - lo || 1;
  const min = lo - span * 0.5;
  const max = hi + span * 0.5;
  const pos = Math.min(1, Math.max(0, (v - min) / (max - min)));
  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-sunken" aria-hidden>
      <span className="absolute inset-y-0 rounded-full bg-routine/35" style={{ left: '25%', right: '25%' }} />
      <motion.span initial={{ left: '50%' }} animate={{ left: `${pos * 100}%` }} transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.2 }}
        className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${flag === 'normal' ? 'bg-routine' : 'bg-seetoday'}`} />
    </div>
  );
}

function TestRow({ test }: { test: Test }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(test.flag === 'low' || test.flag === 'high');
  const hasMore = !!(test.what || test.note || test.flagSource === 'typical');
  return (
    <motion.li variants={riseChild} className={`rounded-2xl bg-surface p-4 ring-1 ${test.urgent ? 'ring-emergency' : 'ring-border'}`}>
      <button type="button" disabled={!hasMore} onClick={() => setOpen((o) => !o)} aria-expanded={hasMore ? open : undefined} className="flex w-full items-start gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium break-words">{test.name}</p>
          {test.range && <p className="mt-0.5 text-caption text-text-3">{t('lab.range')}: {test.range}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-title-3 font-semibold">{test.value} <span className="text-caption font-normal text-text-3">{test.unit}</span></p>
          {test.flag && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-caption font-semibold ${FLAG_STYLE[test.flag]}`}>{t(`lab.flag.${test.flag}`)}</span>}
        </div>
        {hasMore && <motion.span animate={{ rotate: open ? 180 : 0 }} className="mt-1 text-text-3"><ChevronDown size={16} aria-hidden /></motion.span>}
      </button>
      <RangeBar value={test.value} range={test.range} flag={test.flag} />
      <AnimatePresence initial={false}>
        {open && hasMore && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-1.5 pt-3 text-body text-text-2">
              {test.what && <p>{test.what}</p>}
              {test.note && <p className="text-text">{test.note}</p>}
              {test.flagSource === 'report' && <p className="text-caption text-text-3">{t('lab.printedFlag')}</p>}
              {test.flagSource === 'typical' && <p className="text-caption text-text-3">{t('lab.typicalRange')}</p>}
              {test.urgent && <p className="font-medium text-emergency-ink">{t('lab.urgentLine')}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/** Reads a lab report and explains each value against the range the lab printed. */
export function LabReport({ onExit }: { onExit: () => void }) {
  const { t, i18n } = useTranslation();
  const photo = usePhoto();
  const [phase, setPhase] = useState<Phase>('start');
  const [text, setText] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  function reset() {
    pending.current?.abort();
    photo.clear();
    setText('');
    setReport(null);
    setError('');
    setPhase('start');
  }

  async function read() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setPhase('reading');
    try {
      const form = new FormData();
      form.set('language', i18n.language);
      const blob = await photo.blob(2400);
      if (blob) form.set('photo', blob, 'report.jpg');
      else form.set('text', text.trim());
      if (controller.signal.aborted) return;
      const res = await api.post<Report>('/api/lab/read', form, controller.signal);
      if (controller.signal.aborted) return;
      setReport(res);
      setOnlyFlagged(false);
      setPhase('result');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(t(e instanceof ApiError ? (e.status === 429 ? 'lab.tooMany' : e.status === 413 ? 'rx.tooLarge' : 'lab.failed') : 'rx.decode'));
      setPhase('error');
    }
  }

  const back = () => {
    if (phase === 'start') return onExit();
    pending.current?.abort();
    if (phase === 'review' || phase === 'result') reset();
    else setPhase('review');
  };

  const flagged = report?.tests.filter((x) => x.flag === 'low' || x.flag === 'high') ?? [];
  const shown = onlyFlagged ? flagged : report?.tests ?? [];
  const sections = [...new Set(shown.map((x) => x.section ?? ''))];

  return (
    <>
      <TopBar onBack={back} title={t('tools.lab')} />
      <input ref={photo.camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => photo.pick(e.currentTarget) && (setText(''), setPhase('review'))} />
      <input ref={photo.gallery} type="file" accept="image/*" hidden onChange={(e) => photo.pick(e.currentTarget) && (setText(''), setPhase('review'))} />
      <AnimatePresence mode="wait">
        {phase === 'start' && (
          <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col gap-6 pt-2">
            <ToolTabs />
            <div>
              <h1 className="text-title-1 font-semibold lg:text-[2.5rem] lg:leading-tight">{t('lab.heading')}</h1>
              <p className="mt-2 text-body-lg text-text-2">{t('lab.intro')}</p>
            </div>
            <ReportIllustration />
            <ul className="flex flex-col gap-2 text-body text-text-2">
              {(t('lab.tips', { returnObjects: true }) as string[]).map((tip) => (
                <li key={tip} className="flex gap-2.5"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-text-3" />{tip}</li>
              ))}
            </ul>
          </motion.div>
        )}

        {['review', 'reading', 'error'].includes(phase) && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col gap-4 pt-4">
            <h1 className="text-title-1 font-semibold">{t(photo.url ? 'lab.review' : 'lab.paste')}</h1>
            {photo.url ? <img src={photo.url} alt={t('lab.photoAlt')} className="max-h-[50svh] w-full rounded-2xl bg-sunken object-contain" />
              : <textarea autoFocus aria-label={t('lab.paste')} maxLength={16000} rows={8} disabled={phase === 'reading'} value={text} onChange={(e) => setText(e.target.value)} className="rounded-2xl border border-border bg-surface p-4 text-body" />}
            {phase === 'reading' ? <p role="status">{t('lab.reading')}</p> : <p className="text-body text-text-2">{t('lab.share')}</p>}
            {phase === 'error' && <p role="alert" className="rounded-2xl bg-seetoday-tint p-4 text-body text-seetoday-ink">{error}</p>}
          </motion.div>
        )}

        {phase === 'result' && report && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 pt-4">
            {report.notLabReport || !report.tests.length ? (
              <p className="rounded-2xl bg-seetoday-tint px-4 py-3 text-body-lg text-seetoday-ink">{t(report.notLabReport ? 'lab.unrelated' : 'lab.none')}</p>
            ) : (
              <>
                <div>
                  <h1 className="text-title-1 font-semibold">{t('lab.found', { count: report.tests.length })}</h1>
                  {(report.lab || report.date) && <p className="mt-1 text-body text-text-2">{[report.lab, report.date].filter(Boolean).join(' · ')}</p>}
                </div>
                {report.urgent && (
                  <p role="alert" className="flex gap-2.5 rounded-2xl bg-emergency-tint p-4 text-body text-emergency-ink"><AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />{t('lab.urgent')}</p>
                )}
                {report.counts && (
                  <div className="grid grid-cols-3 gap-2">
                    {(['normal', 'low', 'high'] as const).map((k) => (
                      <div key={k} className={`rounded-2xl p-3 text-center ${k === 'normal' ? 'bg-routine-tint text-routine-ink' : report.counts![k] ? 'bg-seetoday-tint text-seetoday-ink' : 'bg-sunken text-text-2'}`}>
                        <p className="tnum text-title-2 font-semibold">{report.counts![k]}</p>
                        <p className="text-caption">{t(`lab.flag.${k}`)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {flagged.length > 0 && flagged.length < report.tests.length && (
                  <button type="button" onClick={() => setOnlyFlagged((v) => !v)} className="self-start rounded-full bg-sunken px-3.5 py-2 text-label font-medium">
                    {onlyFlagged ? t('lab.showAll') : t('lab.showFlagged', { count: flagged.length })}
                  </button>
                )}
                {sections.map((section) => (
                  <section key={section || 'tests'} className="flex flex-col gap-2">
                    {section && <h2 className="text-caption tracking-[0.12em] text-text-3 uppercase">{section}</h2>}
                    <motion.ul variants={staggerParent} initial="hidden" animate="show" className="flex flex-col gap-2">
                      {shown.filter((x) => (x.section ?? '') === section).map((x, i) => <TestRow key={`${x.name}-${i}`} test={x} />)}
                    </motion.ul>
                  </section>
                ))}
              </>
            )}
            <details className="rounded-2xl border border-border p-4"><summary className="cursor-pointer font-medium">{t('rx.original')}</summary>
              {photo.url ? <img src={photo.url} alt={t('lab.photoAlt')} className="mt-3 w-full" /> : <p className="mt-3 whitespace-pre-wrap break-words">{text}</p>}
            </details>
            <p className="text-caption text-text-3">{t('lab.disclaimer')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Dock>
        {phase === 'reading' ? <Button loading>{t('lab.reading')}</Button>
          : phase === 'start' ? (
            <>
              <Button icon={Camera} onClick={() => photo.camera.current?.click()}>{t('lab.take')}</Button>
              <LinkButton onClick={() => photo.gallery.current?.click()} className="inline-flex items-center justify-center gap-2"><ImagePlus size={16} aria-hidden /> {t('rx.choose')}</LinkButton>
              <LinkButton onClick={() => setPhase('review')}>{t('lab.paste')}</LinkButton>
            </>
          ) : phase === 'review' || phase === 'error' ? (
            <>
              <Button disabled={!photo.file && !text.trim()} onClick={() => void read()}>{t('lab.read')}</Button>
              <LinkButton onClick={reset}>{t('rx.change')}</LinkButton>
            </>
          ) : <Button variant="secondary" icon={RefreshCw} onClick={reset}>{t('lab.another')}</Button>}
      </Dock>
    </>
  );
}

/** A report sheet whose rows get their markers one by one. */
function ReportIllustration() {
  const rows = [0.55, 0.14, 0.62, 0.86];
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[360px] [perspective:900px]" aria-hidden>
      <motion.div initial={{ rotateX: 18, rotateZ: 3, y: 12, opacity: 0 }} animate={{ rotateX: 8, rotateZ: 2, y: 0, opacity: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-[6%] flex flex-col gap-3 rounded-[18px] bg-[#fbfaf6] p-4 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_24px_50px_-24px_rgb(0_0_0/0.35)] ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-black/10 pb-2 text-[11px] text-black/45"><span>Lab report</span><span>Ref. range</span></div>
        {rows.map((p, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="h-1.5 w-16 rounded-full bg-black/15" />
            <span className="relative h-1.5 flex-1 rounded-full bg-black/[0.06]">
              <span className="absolute inset-y-0 left-1/4 right-1/4 rounded-full bg-[#30a46c]/30" />
              <motion.span initial={{ left: '50%', opacity: 0 }} animate={{ left: `${p * 100}%`, opacity: 1 }} transition={{ delay: 0.6 + i * 0.35, type: 'spring', stiffness: 120, damping: 14 }}
                className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${p < 0.25 || p > 0.75 ? 'bg-[#f5a524]' : 'bg-[#30a46c]'}`} />
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
