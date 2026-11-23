import { AnimatePresence, motion } from 'motion/react';
import { Camera, ImagePlus, Lightbulb, Minus, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { analyseThali, dishes, type Nutrient, type ThaliItem, type ThaliResult } from '@niktan/core';
import { pickLang } from '../i18n';
import { api } from '../lib/api';
import { haptic } from '../lib/perf';
import { shrink } from '../lib/photo';
import { useScan } from '../state/scan';
import { Button, LinkButton } from '../ui/Button';
import { NutrientRings } from '../ui/visuals/Infographics';
import { Dock, Screen, TopBar } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { riseChild, spring, staggerParent } from '../ui/motion';

type Phase = 'photo' | 'recognising' | 'confirm' | 'result';
const dishById = new Map(dishes.map((d) => [d.id, d]));
const SHOWN: Nutrient[] = ['protein', 'iron', 'fibre', 'vitaminC', 'calcium', 'kcal', 'carbs'];
const REGIONS = ['all', 'chhattisgarh', 'north', 'south', 'east', 'west', 'northeast', 'pan_india'] as const;
const GOOD_TAGS = ['protein', 'iron_rich', 'green_leafy', 'vitamin_c', 'whole_grain', 'millet', 'local'];

/** One dish: what a serving weighs, what it gives, and what it is good or careful about. */
function DishDetails({ id }: { id: string }) {
  const { t } = useTranslation();
  const d = dishById.get(id)!;
  return (
    <div className="flex flex-col gap-4 pb-4">
      <p className="text-body text-text-2">
        {t('thali.perServing', { unit: t(`thali.units.${d.unit}`, { defaultValue: d.unit }), grams: d.grams })} · {t(`thali.regions.${d.region}`)}
      </p>
      {d.aliases.length > 0 && <p className="text-caption text-text-3">{t('thali.alsoCalled')}: {d.aliases.join(', ')}</p>}
      <dl className="grid grid-cols-4 gap-2">
        {(['kcal', 'protein', 'carbs', 'fat', 'fibre', 'iron', 'calcium', 'vitaminC'] as const).map((n) => (
          <div key={n} className="rounded-2xl bg-sunken p-3 text-center">
            <dd className="tnum text-title-3 font-semibold">{d.per[n]}</dd>
            <dt className="text-caption text-text-3">{t(`thali.${n}`)}{n === 'kcal' ? '' : ` (${UNITS[n]})`}</dt>
          </div>
        ))}
      </dl>
      {d.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.tags.map((tag) => (
            <span key={tag} className={`rounded-full px-2.5 py-1 text-caption font-medium ${GOOD_TAGS.includes(tag) ? 'bg-routine-tint text-routine-ink' : 'bg-seetoday-tint text-seetoday-ink'}`}>{t(`thali.tags.${tag}`)}</span>
          ))}
        </div>
      )}
      <p className="text-caption text-text-3">{t(d.indbCode === 'est' ? 'thali.sourceEst' : 'thali.sourceIndb')}</p>
    </div>
  );
}

function Bar({ label, share, value, unit }: { label: string; share: number; value: number; unit: string }) {
  const pct = Math.round(share * 100);
  const tone = share < 0.5 ? 'bg-seetoday' : share > 1.5 ? 'bg-emergency' : 'bg-routine';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-body-lg">{label}</span>
        <span className="tnum text-body text-text-2">
          {value} {unit} · <span className="font-semibold text-text">{pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-sunken">
        <motion.div className={`h-full origin-left rounded-full ${tone}`} initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, share) }} transition={{ ...spring.reveal, delay: 0.2 }} />
      </div>
    </div>
  );
}

const UNITS: Record<Nutrient, string> = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', fibre: 'g', iron: 'mg', calcium: 'mg', vitaminC: 'mg' };

export default function Thali() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const scan = useScan();
  const lang = i18n.language;
  const [phase, setPhase] = useState<Phase>('photo');
  const [photo, setPhoto] = useState<string | null>(null);
  const [items, setItems] = useState<ThaliItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string>('all');
  const [detail, setDetail] = useState<string | null>(null);
  const [unsure, setUnsure] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ThaliResult | null>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const person = { age: scan.profile?.age ?? 30, sex: scan.profile?.sex ?? ('other' as const), pregnant: scan.profile?.pregnant, pallor: !!scan.results.eye?.pallor };

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhoto(url);
    setPhase('recognising');
    setNotice(null);
    let blob: Blob;
    try {
      blob = await shrink(file, url);
    } catch {
      setNotice(t('thali.photoUnreadable'));
      setPhase('confirm');
      return;
    }
    try {
      const form = new FormData();
      form.append('photo', new File([blob], 'thali.jpg', { type: 'image/jpeg' }));
      const r = await api.post<{ items: { dishId: string; count: number; confidence?: number }[]; noFood: boolean; fallback?: string }>('/api/thali/recognize', form);
      const known = r.items.filter((i) => dishById.has(i.dishId));
      setUnsure(new Set(known.filter((i) => (i.confidence ?? 1) < 0.6).map((i) => i.dishId)));
      if (r.noFood) setNotice(t('thali.noFood'));
      else if (r.fallback || !known.length) setNotice(t('thali.manual'));
      const portions = new Map<string, number>();
      for (const { dishId, count } of known) portions.set(dishId, Math.min(10, (portions.get(dishId) ?? 0) + count));
      setItems(Array.from(portions, ([dishId, count]) => ({ dishId, count })));
    } catch {
      setNotice(t('thali.manual'));
    }
    setPhase('confirm');
  };

  const resetPhoto = () => {
    setItems([]);
    setPhoto(null);
    setResult(null);
    setNotice(null);
    setPhase('photo');
  };

  const setCount = (id: string, d: number) =>
    (setUnsure((u) => (u.has(id) ? new Set([...u].filter((x) => x !== id)) : u)), setItems((list) => list.map((i) => (i.dishId === id ? { ...i, count: Math.max(0, Math.min(10, i.count + d)) } : i)).filter((i) => i.count > 0)));

  const add = (id: string) => {
    setItems((list) => (list.some((i) => i.dishId === id) ? list : [...list, { dishId: id, count: 1 }]));
    setPicker(false);
    setQuery('');
    haptic(10);
  };

  const preview = analyseThali(items, person);
  const compute = () => {
    setResult(preview);
    setPhase('result');
    haptic([20, 40, 20]);
    void api.post('/api/thali/compute', { sessionId: scan.sessionId ?? undefined, person, items }).catch(() => undefined);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dishes.filter((d) => (region === 'all' || d.region === region) && (!q || d.en.toLowerCase().includes(q) || d.hi.includes(q) || d.id.includes(q) || d.aliases.some((a) => a.includes(q))));
  }, [query, region]);

  return (
    <Screen>
      <TopBar onBack={() => (phase === 'result' ? setPhase('confirm') : navigate(scan.profile ? '/card' : '/'))} title={t('thali.title')} />
      <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.currentTarget)} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.currentTarget)} />

      <AnimatePresence mode="wait">
        {phase === 'photo' && (
          <motion.div key="photo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <img src="/art/thali-fold.webp" width="780" height="520" alt="" className="h-auto max-h-[32svh] w-full max-w-[420px] object-contain" />
            <p className="max-w-xs text-body-lg text-text-2">{t('thali.instruction')}</p>
          </motion.div>
        )}

        {phase !== 'photo' && phase !== 'result' && (
          <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4 pt-2">
            {photo && (
              <div className="relative overflow-hidden rounded-xl shadow-2">
                <img src={photo} alt="" className="aspect-[4/3] w-full object-cover" />
                {phase === 'recognising' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
                    <motion.div className="absolute inset-x-0 h-0.5 bg-white/80 shadow-[0_0_24px_4px_rgb(255_255_255/0.6)]" animate={{ top: ['8%', '92%', '8%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
                    <span className="text-body-lg font-medium">{t('thali.recognising')}</span>
                  </div>
                )}
              </div>
            )}
            {notice && <p className="rounded-md bg-seetoday-tint px-4 py-3 text-body text-seetoday-ink">{notice}</p>}
            {phase === 'confirm' && (
              <>
                <h2 className="text-title-3 font-semibold">{t('thali.confirm')}</h2>
                <div role="status" aria-live="polite" className="grid grid-cols-3 gap-3 rounded-xl bg-accent-soft p-4 text-accent-soft-ink">
                  {(['kcal', 'protein', 'iron'] as const).map(n => <div key={n}>
                    <span className="block text-caption">{t(`thali.${n}`)}</span>
                    <span className="tnum text-title-3 font-semibold">{preview.totals[n]}</span> <small>{UNITS[n]}</small>
                  </div>)}
                </div>
                <motion.ul layout className="flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {items.map((i) => {
                      const d = dishById.get(i.dishId)!;
                      return (
                        <motion.li key={i.dishId} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={spring.chip} className="flex items-center gap-3 rounded-lg bg-surface py-2 pr-2 pl-4 shadow-1">
                          <button type="button" onClick={() => setDetail(d.id)} className="min-w-0 flex-1 text-left">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-body-lg">{pickLang(d, lang)}</span>
                              {unsure.has(d.id) && <span className="shrink-0 rounded-full bg-seetoday-tint px-2 py-0.5 text-caption font-medium text-seetoday-ink">{t('thali.unsure')}</span>}
                            </span>
                            <span className="text-caption text-text-3">
                              {t(`thali.units.${d.unit}`, { defaultValue: d.unit })} · {Math.round(d.grams * i.count)} g · <span className="underline underline-offset-2">{t('thali.details')}</span>
                            </span>
                          </button>
                          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCount(i.dishId, -0.5)} aria-label={t('design.less', { dish: pickLang(d, lang) })} className="flex size-11 items-center justify-center rounded-md bg-sunken">
                            {i.count <= 0.5 ? <X size={18} /> : <Minus size={18} />}
                          </motion.button>
                          <span className="tnum w-8 text-center text-title-3 font-semibold">{i.count}</span>
                          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCount(i.dishId, 0.5)} disabled={i.count >= 10} aria-label={t('design.more', { dish: pickLang(d, lang) })} className="flex size-11 items-center justify-center rounded-md bg-sunken">
                            <Plus size={18} />
                          </motion.button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </motion.ul>
                <button onClick={() => setPicker(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-body-lg text-text-2">
                  <Plus size={20} aria-hidden /> {t('thali.add')}
                </button>
              </>
            )}
          </motion.div>
        )}

        {phase === 'result' && result && (
          <motion.div key="result" variants={staggerParent} initial="hidden" animate="show" className="flex flex-col gap-4 pt-2">
            <motion.div variants={riseChild} className="rounded-xl bg-surface p-5 shadow-1">
              <NutrientRings
                center={`${Math.round(result.totals.kcal)} kcal`}
                rings={[
                  { label: t('thali.protein'), share: result.share.protein, color: '#0A84FF' },
                  { label: t('thali.iron'), share: result.share.iron, color: '#FF375F' },
                  { label: t('thali.fibre'), share: result.share.fibre, color: '#30D158' },
                  { label: t('thali.vitaminC'), share: result.share.vitaminC, color: '#FF9F0A' },
                ]}
              />
            </motion.div>
            <motion.div variants={riseChild} className="rounded-lg bg-surface p-5 shadow-1">
              <p className="text-caption text-text-3">{t('thali.perMeal')}</p>
              <div className="mt-3 flex flex-col gap-4">
                {SHOWN.map((n) => (
                  <Bar key={n} label={t(`thali.${n}`)} share={result.share[n]} value={result.totals[n]} unit={UNITS[n]} />
                ))}
                <p className="flex justify-between text-body-lg"><span>{t('thali.fat')}</span><span>{result.totals.fat} g</span></p>
                <p className="text-caption text-text-3">{t(scan.profile ? 'thali.targetHint' : 'thali.defaultTarget')}</p>
              </div>
            </motion.div>
            {result.swaps.length > 0 && (
              <motion.div variants={riseChild} className="rounded-lg bg-accent-soft p-5 text-accent-soft-ink">
                <p className="flex items-center gap-2 text-title-3 font-semibold">
                  <Lightbulb size={20} aria-hidden /> {t('thali.advice')}
                </p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {result.swaps.map((s) => (
                    <motion.li key={s.id} variants={riseChild} className="text-body-lg">
                      {pickLang(s, lang)}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            )}
            <motion.p variants={riseChild} className="text-caption text-text-3">
              INDB (Vijayakumar et al., 2024) · ICMR-NIN RDA 2020
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <Dock>
        {phase === 'photo' && (
          <>
            <Button icon={Camera} onClick={() => camInput.current?.click()}>
              {t('thali.take')}
            </Button>
            <LinkButton onClick={() => fileInput.current?.click()} className="inline-flex items-center justify-center gap-2">
              <ImagePlus size={18} aria-hidden /> {t('thali.choose')}
            </LinkButton>
            <LinkButton onClick={() => setPhase('confirm')}>{t('thali.add')}</LinkButton>
          </>
        )}
        {phase === 'confirm' && (
          <>
            <Button disabled={!items.length} onClick={compute}>
              {t('thali.compute')}
            </Button>
            {photo && <LinkButton onClick={resetPhoto}>{t('thali.newPhoto')}</LinkButton>}
          </>
        )}
        {phase === 'result' && (
          <Button variant="secondary" onClick={resetPhoto}>
            {t('thali.take')}
          </Button>
        )}
      </Dock>

      <Sheet open={picker} onClose={() => setPicker(false)} title={t('thali.add')}>
        <label className="sticky top-16 z-10 flex items-center gap-2 rounded-md border border-border-strong bg-sunken px-3">
          <Search size={18} className="text-text-3" aria-hidden />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent outline-none" aria-label={t('thali.add')} />
        </label>
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {REGIONS.map((r) => (
            <button key={r} type="button" onClick={() => setRegion(r)} aria-pressed={region === r}
              className={`shrink-0 rounded-full px-3.5 py-2 text-label font-medium transition-colors ${region === r ? 'bg-text text-surface' : 'bg-sunken text-text-2'}`}>
              {t(`thali.regions.${r}`)}
            </button>
          ))}
        </div>
        <ul className="mt-2 flex flex-col">
          {filtered.map((d) => (
            <li key={d.id}>
              <button onClick={() => add(d.id)} className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border py-2 text-left">
                <span className="min-w-0">
                  <span className="block text-body-lg">{pickLang(d, lang)}</span>
                  {d.aliases.length > 0 && <span className="block truncate text-caption text-text-3">{d.aliases.slice(0, 3).join(' · ')}</span>}
                </span>
                <span className="tnum shrink-0 text-right text-caption text-text-3">
                  {t(`thali.units.${d.unit}`, { defaultValue: d.unit })}<br />{d.per.kcal} kcal · {d.per.protein} g {t('thali.proteinShort')}
                </span>
              </button>
            </li>
          ))}
          {!filtered.length && <li className="py-6 text-center text-body text-text-2">{t('thali.noDish')}</li>}
        </ul>
      </Sheet>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail ? pickLang(dishById.get(detail)!, lang) : ''}>
        {detail && <DishDetails id={detail} />}
      </Sheet>
    </Screen>
  );
}
