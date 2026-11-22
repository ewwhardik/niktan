import { AnimatePresence, motion } from 'motion/react';
import { Check, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/perf';
import { useScan } from '../state/scan';
import { Button } from '../ui/Button';
import { Dock, Screen, TopBar } from '../ui/Layout';
import { spring } from '../ui/motion';

export default function Feedback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, sync } = useScan();
  const [rating, setRating] = useState(0);
  const [wouldUse, setWouldUse] = useState<boolean | null>(null);
  const [wait, setWait] = useState('');
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState(false);

  if (sent) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.chip} className="flex size-24 items-center justify-center rounded-full bg-routine text-routine-on shadow-3">
            <motion.svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.2 }} />
            </motion.svg>
          </motion.div>
          <p className="text-title-1 font-semibold">{t('feedback.thanks')}</p>
        </div>
        <Dock>
          <Button variant="secondary" onClick={() => navigate('/')}>
            {t('common.done')}
          </Button>
        </Dock>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar onBack={() => navigate(-1)} title={t('feedback.title')} />
      <h1 className="mt-4 text-title-1 font-semibold">{t('feedback.rating')}</h1>
      <div className="mt-4 flex justify-between" role="radiogroup" aria-label={t('feedback.rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}`}
            whileTap={{ scale: 0.8 }}
            animate={{ scale: rating >= n ? 1.08 : 1 }}
            transition={spring.chip}
            onClick={() => {
              setRating(n);
              haptic(10);
            }}
            className="flex size-14 items-center justify-center"
          >
            <Star size={40} strokeWidth={1.5} className={rating >= n ? 'fill-[var(--seetoday)] text-[var(--seetoday)]' : 'text-border-strong'} />
          </motion.button>
        ))}
      </div>

      <p className="mt-8 text-body-lg">{t('feedback.wouldUse')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[true, false].map((v) => (
          <button key={String(v)} onClick={() => setWouldUse(v)} className={`relative min-h-14 rounded-md border text-title-3 ${wouldUse === v ? 'border-transparent bg-accent-soft text-accent-soft-ink' : 'border-border bg-surface'}`}>
            <AnimatePresence>{wouldUse === v && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-2 right-2"><Check size={16} /></motion.span>}</AnimatePresence>
            {v ? t('info.yes') : t('info.no')}
          </button>
        ))}
      </div>

      <label className="mt-8 flex flex-col gap-2">
        <span className="text-body-lg">{t('feedback.lastWait')}</span>
        <input inputMode="numeric" value={wait} onChange={(e) => setWait(e.target.value.replace(/\D/g, '').slice(0, 4))} className="tnum h-14 rounded-sm border border-border-strong bg-sunken px-4 outline-none focus:border-accent" />
      </label>
      <label className="mt-6 flex flex-col gap-2">
        <span className="text-body-lg">{t('feedback.comment')}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 1000))} rows={3} className="rounded-sm border border-border-strong bg-sunken p-4 outline-none focus:border-accent" />
      </label>

      <Dock>
        {error && <p role="alert" className="text-emergency-text">{t('feedback.failed')}</p>}
        {Number(wait) > 1440 && <p role="alert">{t('feedback.invalidWait')}</p>}
        <Button
          disabled={!rating || wouldUse === null || Number(wait) > 1440}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(false);
            try {
              const sessionId = profile ? await sync() : 'anonymous';
              if (!sessionId) throw new Error('Sync failed');
              await api.post('/api/feedback', { sessionId, rating, wouldUse, lastOpdWaitMin: wait ? Number(wait) : null, comment });
              setSent(true);
              haptic([20, 40, 20]);
            } catch {
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('feedback.send')}
        </Button>
      </Dock>
    </Screen>
  );
}
