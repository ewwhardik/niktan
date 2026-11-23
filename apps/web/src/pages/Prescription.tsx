import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Camera, ChevronDown, ExternalLink, ImagePlus, Moon, Pill, RefreshCw, Sun, Sunrise } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { shrink } from '../lib/photo';
import { Button, LinkButton } from '../ui/Button';
import { Dock, Screen, TopBar } from '../ui/Layout';
import { riseChild, staggerParent } from '../ui/motion';

interface Medicine {
  name: string;
  generic?: string | null;
  strength?: string | null;
  form?: string | null;
  dose?: string | null;
  frequency?: string | null;
  timing?: string | null;
  duration?: string | null;
  confidence: number;
  unclear: boolean;
}

interface Reading {
  notPrescription: boolean;
  medicines: Medicine[];
  advice: string[];
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

type Phase = 'photo' | 'reading' | 'result' | 'error';

/** Morning, afternoon and night doses from a "1-0-1" style pattern, if the reading has one. */
function slots(m: Medicine): number[] | null {
  const pattern = `${m.frequency ?? ''} ${m.dose ?? ''}`.match(/\b(\d(?:\/\d)?)\s*-\s*(\d(?:\/\d)?)\s*-\s*(\d(?:\/\d)?)\b/);
  if (pattern) return pattern.slice(1, 4).map((v) => (v!.includes('/') ? 0.5 : Number(v)));
  const f = (m.frequency ?? '').toLowerCase();
  if (/\b(od|once a day)\b/.test(f)) return [1, 0, 0];
  if (/\b(bd|bid|twice a day)\b/.test(f)) return [1, 0, 1];
  if (/\b(tds|tid|three times)\b/.test(f)) return [1, 1, 1];
  if (/\b(hs|bedtime)\b/.test(f)) return [0, 0, 1];
  return null;
}

function Schedule({ m }: { m: Medicine }) {
  const { t } = useTranslation();
  const s = slots(m);
  if (!s) return null;
  const parts = [
    { icon: Sunrise, label: t('rx.morning') },
    { icon: Sun, label: t('rx.afternoon') },
    { icon: Moon, label: t('rx.night') },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label={t('rx.schedule')}>
      {parts.map((p, i) => (
        <div key={p.label} className={`flex flex-col items-center gap-1 rounded-xl py-2 ${s[i] ? 'bg-text text-bg' : 'bg-sunken text-text-3'}`}>
          <p.icon size={16} aria-hidden />
          <span className="text-caption">{p.label}</span>
          <span className="tnum text-label font-semibold">{s[i] ? (s[i] === 0.5 ? '½' : s[i]) : '—'}</span>
        </div>
      ))}
    </div>
  );
}

function MedicineCard({ m, index }: { m: Medicine; index: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null | 'loading' | 'error'>(null);
  async function toggle() {
    setOpen((v) => !v);
    if (info) return;
    setInfo('loading');
    try {
      const query = m.generic || m.name.replace(/^(tab|cap|syp|inj|oint|drops?)\.?\s+/i, '');
      setInfo(await api.get<Info>(`/api/rx/info?name=${encodeURIComponent(query)}`));
    } catch {
      setInfo('error');
    }
  }
  const facts = [m.strength, m.form, m.dose].filter(Boolean).join(' · ');
  return (
    <motion.li variants={riseChild} className="overflow-hidden rounded-[24px] bg-surface shadow-1 ring-1 ring-border">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sunken text-label font-semibold">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-title-3 font-semibold">{m.name}</p>
            {m.generic && <p className="text-body text-text-2">{m.generic}</p>}
            {facts && <p className="mt-0.5 text-caption text-text-3">{facts}</p>}
          </div>
          {m.unclear && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-seetoday-tint px-2.5 py-1 text-caption font-medium text-seetoday-ink">
              <AlertTriangle size={12} aria-hidden /> {t('rx.check')}
            </span>
          )}
        </div>
        <Schedule m={m} />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[m.frequency, m.timing, m.duration].filter(Boolean).map((v) => (
            <span key={v} className="rounded-full bg-sunken px-2.5 py-1 text-caption text-text-2">{v}</span>
          ))}
        </div>
      </div>
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
    </motion.li>
  );
}

/** Reads a photographed prescription, handwriting included, and explains each medicine. */
export default function Prescription() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const camInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('photo');
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string>('');

  async function onFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhoto(url);
    setPhase('reading');
    try {
      // Handwriting needs more pixels than a food photo.
      const blob = await shrink(file, url, 1800, 0.88);
      const form = new FormData();
      form.append('photo', blob, 'prescription.jpg');
      const res = await api.post<Reading>('/api/rx/read', form);
      setReading(res);
      setPhase('result');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? t('rx.tooMany') : t('rx.failed'));
      setPhase('error');
    }
  }

  return (
    <Screen>
      <TopBar onBack={() => (phase === 'photo' ? navigate(-1) : setPhase('photo'))} title={t('rx.title')} />
      <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.currentTarget)} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.currentTarget)} />

      <AnimatePresence mode="wait">
        {phase === 'photo' && (
          <motion.div key="photo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col gap-6 pt-4">
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

        {(phase === 'reading' || phase === 'error') && photo && (
          <motion.div key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col gap-4 pt-4">
            <div className="relative overflow-hidden rounded-[24px] bg-sunken shadow-2">
              <img src={photo} alt={t('rx.photoAlt')} className="max-h-[56svh] w-full object-contain" />
              {phase === 'reading' && (
                <div className="absolute inset-0 flex items-end justify-center bg-black/25 pb-5">
                  <motion.div className="absolute inset-x-0 h-[2px] bg-[#0071e3]" animate={{ top: ['6%', '94%', '6%'] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />
                  <span className="rounded-full bg-black/70 px-4 py-2 text-label font-medium text-white backdrop-blur">{t('rx.reading')}</span>
                </div>
              )}
            </div>
            {phase === 'error' && <p role="alert" className="rounded-2xl bg-seetoday-tint px-4 py-3 text-body text-seetoday-ink">{error}</p>}
          </motion.div>
        )}

        {phase === 'result' && reading && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 pt-4">
            {reading.notPrescription || !reading.medicines.length ? (
              <p className="rounded-2xl bg-seetoday-tint px-4 py-3 text-body-lg text-seetoday-ink">{t('rx.none')}</p>
            ) : (
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
                <ul className="mt-2 flex flex-col gap-1.5 text-body text-text-2">
                  {reading.advice.map((a) => <li key={a}>• {a}</li>)}
                </ul>
              </div>
            )}
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
          </>
        ) : (
          <Button variant="secondary" icon={RefreshCw} onClick={() => setPhase('photo')}>{t('rx.another')}</Button>
        )}
      </Dock>
    </Screen>
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
