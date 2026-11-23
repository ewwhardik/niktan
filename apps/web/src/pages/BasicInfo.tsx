import { AnimatePresence, motion } from 'motion/react';
import { Check, Ear, Glasses, Minus, Plus, Zap } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { planMinutes, useScan, type Plan, type Profile } from '../state/scan';
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
  const { begin, profile, plan: savedPlan, setPlan: savePlan } = useScan();
  const location = useLocation();
  const prior = location.state?.consented ? null : profile;
  const [age, setAge] = useState(prior ? String(prior.age) : '');
  const [sex, setSex] = useState<Profile['sex'] | null>(prior?.sex ?? null);
  const [pregnant, setPregnant] = useState<'yes' | 'no' | null>(prior?.sex === 'female' && prior.age >= 12 && prior.age <= 55 ? (prior.pregnant ? 'yes' : 'no') : null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan>(prior ? savedPlan : 'quick');

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
        <div className="flex flex-col gap-2">
          <label htmlFor="profile-age" className="text-label font-medium text-text-2">{t('info.age')}</label>
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => bump(-1)} aria-label="-1" className="flex size-14 items-center justify-center rounded-md border border-border bg-surface">
              <Minus size={22} />
            </motion.button>
            <input
              id="profile-age"
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
        </div>

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

        <div className="flex flex-col gap-2">
          <span id="plan-label" className="text-label font-medium text-text-2">{t('plan.title')}</span>
          <div role="radiogroup" aria-labelledby="plan-label" className="grid gap-3 sm:grid-cols-2">
            {([
              { id: 'quick', icon: Zap, extras: [] },
              { id: 'full', icon: Glasses, extras: [Glasses, Ear] },
            ] as const).map((o) => {
              const on = plan === o.id;
              return (
                <motion.button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPlan(o.id)}
                  className={`relative flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors ${on ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-border bg-surface hover:bg-sunken'}`}
                >
                  <span className="flex w-full items-center gap-2">
                    <o.icon size={18} aria-hidden />
                    <span className="text-body-lg font-semibold">{t(`plan.${o.id}`)}</span>
                    <span className="tnum ml-auto rounded-full bg-sunken px-2 py-0.5 text-caption font-medium text-text-2">{t('plan.minutes', { n: planMinutes(o.id) })}</span>
                  </span>
                  <span className={`text-body ${on ? '' : 'text-text-2'}`}>{t(`plan.${o.id}Sub`)}</span>
                  {on && <Check size={16} className="absolute right-3 bottom-3" aria-hidden />}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      <Dock>
        <Button
          disabled={!ready}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const next = { age: ageNum, sex: sex!, pregnant: askPregnant && pregnant === 'yes' };
            if (!prior || prior.age !== next.age || prior.sex !== next.sex || prior.pregnant !== next.pregnant) {
              await begin(next, i18n.language, plan);
            } else if (plan !== savedPlan) {
              savePlan(plan);
            }
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
