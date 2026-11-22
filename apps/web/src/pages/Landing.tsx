import { motion } from 'motion/react';
import { ArrowRight, Ear, Eye, Glasses, HeartPulse, Hospital, Mic, ShieldCheck, Soup } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useScan } from '../state/scan';
import { Button } from '../ui/Button';
import { Dock, LangToggle, Screen } from '../ui/Layout';
import { CountUp } from '../ui/Numbers';
import { riseChild, spring, staggerParent } from '../ui/motion';

const STEP_ICONS = [HeartPulse, Eye, Glasses, Ear, Mic];

/** Brand mark: a pulse line that draws itself once. */
function Mark() {
  return (
    <svg viewBox="0 0 120 120" className="size-14" aria-hidden>
      <rect width="120" height="120" rx="32" fill="var(--accent)" />
      <motion.path
        d="M22 64h18l9-22 13 42 11-30 6 10h19"
        fill="none"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: [0.65, 0, 0.35, 1], delay: 0.15 }}
      />
    </svg>
  );
}

export function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useScan();
  const [stats, setStats] = useState<{ screened: number } | null>(null);
  useEffect(() => {
    api.get<{ screened: number }>('/api/stats/public').then(setStats).catch(() => undefined);
  }, []);

  return (
    <Screen>
      <header className="flex items-center justify-between py-2">
        <span className="text-title-3 font-semibold tracking-tight">{t('app.name')}</span>
        <LangToggle />
      </header>

      <motion.section variants={staggerParent} initial="hidden" animate="show" className="flex flex-1 flex-col pt-10">
        <motion.div variants={riseChild}>
          <Mark />
        </motion.div>
        <motion.h1 variants={riseChild} className="mt-8 text-display font-semibold text-balance">
          {t('landing.greeting')}
        </motion.h1>
        <motion.p variants={riseChild} className="mt-3 text-body-lg text-text-2 text-pretty">
          {t('app.sub')}
        </motion.p>

        <motion.ul variants={riseChild} className="mt-8 flex items-center gap-2" aria-label={t('landing.steps')}>
          {STEP_ICONS.map((Icon, i) => (
            <motion.li
              key={i}
              className="flex size-12 items-center justify-center rounded-md bg-surface text-accent-text shadow-1"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring.reveal, delay: 0.35 + i * 0.07 }}
            >
              <Icon size={22} strokeWidth={1.75} aria-hidden />
            </motion.li>
          ))}
        </motion.ul>
        <motion.p variants={riseChild} className="mt-3 text-caption text-text-3">
          {t('landing.steps')}
        </motion.p>

        <motion.div variants={riseChild} className="mt-8 flex items-start gap-3 rounded-lg bg-surface p-4 shadow-1">
          <ShieldCheck className="mt-0.5 shrink-0 text-routine-text" size={22} strokeWidth={1.75} aria-hidden />
          <p className="text-body text-text-2">{t('landing.privacy')}</p>
        </motion.div>

        {stats && stats.screened > 0 && (
          <motion.p variants={riseChild} className="mt-6 text-body text-text-2">
            <CountUp value={stats.screened} className="font-semibold text-text" /> {t('landing.screened')}
          </motion.p>
        )}
      </motion.section>

      <Dock>
        <Button onClick={() => navigate('/start')} trailingIcon={ArrowRight}>
          {t('landing.cta')}
        </Button>
        {profile && <Button variant="secondary" onClick={() => navigate('/card')}>{t('landing.resume')}</Button>}
        <div className="flex justify-between">
          <button onClick={() => navigate('/thali')} className="inline-flex min-h-12 items-center gap-2 text-body text-text-2 hover:text-text">
            <Soup size={18} strokeWidth={1.75} aria-hidden /> {t('landing.thali')}
          </button>
          <button onClick={() => navigate('/hospital')} className="inline-flex min-h-12 items-center gap-2 text-body text-text-2 hover:text-text">
            <Hospital size={18} strokeWidth={1.75} aria-hidden /> {t('landing.hospital')}
          </button>
        </div>
        <button onClick={() => navigate('/status')} className="mx-auto min-h-10 text-caption text-text-2 underline">{t('service.title')}</button>
      </Dock>
    </Screen>
  );
}
