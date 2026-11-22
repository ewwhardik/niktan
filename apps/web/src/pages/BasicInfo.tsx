import { AnimatePresence, motion } from 'motion/react';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useScan, type Profile } from '../state/scan';
import { Button } from '../ui/Button';
import { Dock, Screen, TopBar } from '../ui/Layout';
import { spring } from '../ui/motion';

function Segmented<T extends string>({ value, options, onChange, label }: { value: T | null; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="relative grid gap-1 rounded-md bg-sunken p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className="relative min-h-12 rounded-sm text-body-lg font-medium">
          {value === o.id && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-sm bg-surface shadow-2" transition={spring.layout} />}
          <span className={`relative ${value === o.id ? 'text-text' : 'text-text-2'}`}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function BasicInfo() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { begin, profile } = useScan();
  const location = useLocation();
  const [age, setAge] = useState<string>('');
  const [sex, setSex] = useState<Profile['sex'] | null>(null);
  const [pregnant, setPregnant] = useState<'yes' | 'no' | null>(null);
  const [busy, setBusy] = useState(false);

  if (!location.state?.consented && !profile) return <Navigate to="/start" replace />;

  const ageNum = Number(age);
  const ageValid = age !== '' && Number.isInteger(ageNum) && ageNum >= 0 && ageNum <= 120;
  const askPregnant = sex === 'female' && ageValid && ageNum >= 12 && ageNum <= 55;
  const ready = ageValid && sex !== null && (!askPregnant || pregnant !== null);

  const bump = (d: number) => setAge((a) => String(Math.max(0, Math.min(120, (Number(a) || (d > 0 ? 29 : 31)) + d))));

  return (
    <Screen>
      <TopBar onBack={() => navigate('/start')} />
      <h1 className="mt-4 text-title-1 font-semibold">{t('info.title')}</h1>

      <div className="mt-8 flex flex-col gap-7">
        <label className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-2">{t('info.age')}</span>
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => bump(-1)} aria-label="-1" className="flex size-14 items-center justify-center rounded-md border border-border bg-surface">
              <Minus size={22} />
            </motion.button>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className="tnum h-14 min-w-0 flex-1 rounded-sm border border-border-strong bg-sunken text-center text-title-1 font-semibold outline-none focus:border-accent"
              aria-invalid={age !== '' && !ageValid}
              placeholder="—"
            />
            <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => bump(1)} aria-label="+1" className="flex size-14 items-center justify-center rounded-md border border-border bg-surface">
              <Plus size={22} />
            </motion.button>
          </div>
          {age !== '' && !ageValid && <span className="text-caption text-emergency-text">{t('info.ageInvalid')}</span>}
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-2">{t('info.sex')}</span>
          <Segmented
            label={t('info.sex')}
            value={sex}
            onChange={setSex}
            options={[
              { id: 'female', label: t('info.female') },
              { id: 'male', label: t('info.male') },
              { id: 'other', label: t('info.other') },
            ]}
          />
        </div>

        <AnimatePresence initial={false}>
          {askPregnant && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.reveal} className="flex flex-col gap-2 overflow-hidden">
              <span className="text-label font-medium text-text-2">{t('info.pregnant')}</span>
              <Segmented label={t('info.pregnant')} value={pregnant} onChange={setPregnant} options={[{ id: 'no', label: t('info.no') }, { id: 'yes', label: t('info.yes') }]} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Dock>
        <Button
          disabled={!ready}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await begin({ age: ageNum, sex: sex!, pregnant: askPregnant && pregnant === 'yes' }, i18n.language);
            setBusy(false);
            navigate('/scan/face');
          }}
        >
          {t('common.start')}
        </Button>
      </Dock>
    </Screen>
  );
}
