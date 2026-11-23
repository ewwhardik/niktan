import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, QrCode, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { REVIEW_EXPERIENCE, REVIEW_FEATURES, type ReviewFeature, type ReviewSection } from '@niktan/core';
import { api, ApiError } from '../lib/api';
import { haptic } from '../lib/perf';
import { Button } from '../ui/Button';
import { Dock, Screen, TopBar } from '../ui/Layout';
import { spring } from '../ui/motion';
import { Stars } from '../ui/Stars';

export default function Review() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [team, setTeam] = useState('');
  const [overall, setOverall] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Partial<Record<ReviewSection, number>>>({});
  const [tried, setTried] = useState<ReviewFeature[]>([]);
  const rate = (s: ReviewSection, v: number | null) => setRatings((r) => { const next = { ...r }; if (v === null) delete next[s]; else next[s] = v; return next; });
  const toggleTried = (f: ReviewFeature) => {
    setTried((list) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]));
    if (tried.includes(f)) rate(f, null);
    haptic(8);
  };
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const ready = team.trim().length >= 2 && overall !== null;

  if (sent) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.chip} className="flex size-24 items-center justify-center rounded-full bg-routine text-routine-on shadow-3">
            <Star size={44} className="fill-current" aria-hidden />
          </motion.div>
          <h1 className="text-title-1 font-semibold">{t('review.thanks', { team: team.trim() })}</h1>
          <p className="max-w-sm text-body-lg text-text-2">{t('review.thanksSub')}</p>
        </div>
        <Dock>
          <Button trailingIcon={ArrowRight} onClick={() => navigate('/#reviews')}>{t('review.seeIt')}</Button>
          <Button variant="secondary" onClick={() => { setSent(false); setTeam(''); setOverall(null); setRatings({}); setTried([]); setRemark(''); }}>{t('review.another')}</Button>
        </Dock>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar onBack={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }))} title={t('review.title')} />
      <h1 className="mt-4 text-title-1 font-semibold">{t('review.heading')}</h1>
      <p className="mt-2 text-body text-text-2">{t('review.intro')}</p>

      <label className="mt-7 flex flex-col gap-2">
        <span className="text-label font-medium text-text-2">{t('review.team')}</span>
        <input value={team} onChange={(e) => setTeam(e.target.value.slice(0, 60))} placeholder={t('review.teamPlaceholder')} autoComplete="organization"
          className="h-14 rounded-sm border border-border-strong bg-sunken px-4 text-body-lg outline-none focus:border-accent" />
      </label>

      <div className="mt-7 flex flex-col gap-1">
        <span className="text-label font-medium text-text-2">{t('review.overall')}</span>
        <Stars value={overall} onChange={setOverall} size={40} label={t('review.overall')} />
      </div>

      <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg bg-surface">
        {REVIEW_EXPERIENCE.map((s) => (
          <li key={s} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="text-body font-medium">{t(`review.section.${s}`)}</span>
            <Stars value={ratings[s] ?? null} size={24} label={t(`review.section.${s}`)} onChange={(v) => rate(s, v)} />
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <span className="text-label font-medium text-text-2">{t('review.triedTitle')}</span>
        <p className="text-caption text-text-3">{t('review.triedHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {REVIEW_FEATURES.map((f) => {
            const on = tried.includes(f);
            return (
              <motion.button key={f} type="button" aria-pressed={on} whileTap={{ scale: 0.95 }} onClick={() => toggleTried(f)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-label font-medium ${on ? 'border-transparent bg-accent text-on-accent' : 'border-border bg-surface text-text-2'}`}>
                {on && <Check size={15} aria-hidden />} {t(`review.section.${f}`)}
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence initial={false}>
          {tried.length > 0 && (
            <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 divide-y divide-border overflow-hidden rounded-lg bg-surface">
              <li className="px-4 pt-3 pb-1 text-caption text-text-3">{t('review.rateTried')}</li>
              {REVIEW_FEATURES.filter((f) => tried.includes(f)).map((f) => (
                <li key={f} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-body">{t(`review.section.${f}`)}</span>
                  <Stars value={ratings[f] ?? null} size={24} label={t(`review.section.${f}`)} onChange={(v) => rate(f, v)} />
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <label className="mt-7 flex flex-col gap-2">
        <span className="flex justify-between text-label font-medium text-text-2">{t('review.remark')}<span className="tnum text-text-3">{remark.length}/400</span></span>
        <textarea value={remark} onChange={(e) => setRemark(e.target.value.slice(0, 400))} rows={4} placeholder={t('review.remarkPlaceholder')}
          className="rounded-sm border border-border-strong bg-sunken p-4 text-body outline-none focus:border-accent" />
      </label>
      <p className="mt-2 text-caption text-text-3">{t('review.public')}</p>
      <button onClick={() => navigate('/review/share')} className="mt-4 inline-flex min-h-11 items-center gap-2 self-start text-body text-text-2 underline-offset-4 hover:underline">
        <QrCode size={16} aria-hidden /> {t('review.shareLink')}
      </button>

      <Dock>
        {error && <p role="alert" className="text-emergency-text">{error}</p>}
        <Button
          disabled={!ready}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.post('/api/reviews', { team: team.trim(), overall, tried, ratings, remark: remark.trim() });
              setSent(true);
              haptic([20, 40, 20]);
            } catch (e) {
              setError(e instanceof ApiError && e.status === 429 ? t('review.tooMany') : t('review.failed'));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('review.send')}
        </Button>
      </Dock>
    </Screen>
  );
}
