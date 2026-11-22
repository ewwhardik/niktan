import { AnimatePresence, motion } from 'motion/react';
import { Camera, ImagePlus, Lightbulb, Minus, Plus, Search, Soup, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { analyseThali, dishes, type Nutrient, type ThaliItem, type ThaliResult } from '@niktan/core';
import { pickLang } from '../i18n';
import { api } from '../lib/api';
import { haptic } from '../lib/perf';
import { useScan } from '../state/scan';
import { Button, LinkButton } from '../ui/Button';
import { Dock, Screen, TopBar } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { riseChild, spring, staggerParent } from '../ui/motion';

type Phase = 'photo' | 'recognising' | 'confirm' | 'result';
const dishById = new Map(dishes.map((d) => [d.id, d]));
const SHOWN: Nutrient[] = ['protein', 'iron', 'fibre', 'vitaminC', 'calcium', 'kcal'];

/** Downscales a photo to at most 1024 px so uploads stay small on 3G. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b ?? file), 'image/jpeg', 0.82));
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
  const [result, setResult] = useState<ThaliResult | null>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const person = { age: scan.profile?.age ?? 30, sex: scan.profile?.sex ?? ('other' as const), pregnant: scan.profile?.pregnant, pallor: !!scan.results.eye?.pallor };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
    setPhase('recognising');
    setNotice(null);
    try {
      const blob = await shrink(file);
      const form = new FormData();
      form.append('photo', new File([blob], 'thali.jpg', { type: 'image/jpeg' }));
      const r = await api.post<{ items: { dishId: string; count: number }[]; noFood: boolean; fallback?: string }>('/api/thali/recognize', form);
      const known = r.items.filter((i) => dishById.has(i.dishId));
      if (r.noFood) setNotice(t('thali.noFood'));
      else if (r.fallback || !known.length) setNotice(t('thali.manual'));
      setItems(known.map((i) => ({ dishId: i.dishId, count: i.count })));
    } catch {
      setNotice(t('thali.manual'));
    }
    setPhase('confirm');
  };

  const setCount = (id: string, d: number) =>
    setItems((list) => list.map((i) => (i.dishId === id ? { ...i, count: Math.max(0, Math.min(10, i.count + d)) } : i)).filter((i) => i.count > 0));

  const add = (id: string) => {
    setItems((list) => (list.some((i) => i.dishId === id) ? list : [...list, { dishId: id, count: 1 }]));
    setPicker(false);
    setQuery('');
    haptic(10);
  };

  const compute = () => {
    const r = analyseThali(items, person);
    setResult(r);
    setPhase('result');
    haptic([20, 40, 20]);
    void api.post('/api/thali/compute', { sessionId: scan.sessionId ?? undefined, person, items }).catch(() => undefined);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dishes.filter((d) => !q || d.en.toLowerCase().includes(q) || d.hi.includes(q) || d.id.includes(q));
  }, [query]);

  return (
    <Screen>
      <TopBar onBack={() => (phase === 'result' ? setPhase('confirm') : navigate(scan.profile ? '/card' : '/'))} title={t('thali.title')} />
      <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />

      <AnimatePresence mode="wait">
        {phase === 'photo' && (
          <motion.div key="photo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <motion.div animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="flex size-28 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
              <Soup size={52} strokeWidth={1.25} aria-hidden />
            </motion.div>
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
                <motion.ul layout className="flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {items.map((i) => {
                      const d = dishById.get(i.dishId)!;
                      return (
                        <motion.li key={i.dishId} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={spring.chip} className="flex items-center gap-3 rounded-lg bg-surface py-2 pr-2 pl-4 shadow-1">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-lg">{pickLang(d, lang)}</span>
                            <span className="text-caption text-text-3">
                              {d.unit} · {Math.round(d.grams)} g
                            </span>
                          </span>
                          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCount(i.dishId, -0.5)} aria-label="-" className="flex size-11 items-center justify-center rounded-md bg-sunken">
                            {i.count <= 0.5 ? <X size={18} /> : <Minus size={18} />}
                          </motion.button>
                          <span className="tnum w-8 text-center text-title-3 font-semibold">{i.count}</span>
                          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCount(i.dishId, 0.5)} aria-label="+" className="flex size-11 items-center justify-center rounded-md bg-sunken">
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
            <motion.div variants={riseChild} className="rounded-lg bg-surface p-5 shadow-1">
              <p className="text-caption text-text-3">{t('thali.perMeal')}</p>
              <div className="mt-3 flex flex-col gap-4">
                {SHOWN.map((n) => (
                  <Bar key={n} label={t(`thali.${n}`)} share={result.share[n]} value={result.totals[n]} unit={UNITS[n]} />
                ))}
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
          <Button disabled={!items.length} onClick={compute}>
            {t('thali.compute')}
          </Button>
        )}
        {phase === 'result' && (
          <Button
            variant="secondary"
            onClick={() => {
              setItems([]);
              setPhoto(null);
              setResult(null);
              setPhase('photo');
            }}
          >
            {t('thali.take')}
          </Button>
        )}
      </Dock>

      <Sheet open={picker} onClose={() => setPicker(false)} title={t('thali.add')}>
        <label className="sticky top-16 z-10 flex items-center gap-2 rounded-md border border-border-strong bg-sunken px-3">
          <Search size={18} className="text-text-3" aria-hidden />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent outline-none" aria-label={t('thali.add')} />
        </label>
        <ul className="mt-3 flex flex-col">
          {filtered.map((d) => (
            <li key={d.id}>
              <button onClick={() => add(d.id)} className="flex min-h-14 w-full items-center justify-between border-b border-border text-left">
                <span className="text-body-lg">{pickLang(d, lang)}</span>
                <span className="text-caption text-text-3">{d.unit}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </Screen>
  );
}
