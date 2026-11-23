import { AnimatePresence, motion } from 'motion/react';
import { BellRing, Clock, Hospital, IdCard, LogOut, MonitorSmartphone, PhoneCall, Ticket, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { departments, type DepartmentId, type Priority } from '@niktan/core';
import { pickLang } from '../i18n';
import { api, ApiError } from '../lib/api';
import { haptic } from '../lib/perf';
import { useScan } from '../state/scan';
import { Button } from '../ui/Button';
import { PRIORITY_META } from '../ui/Chip';
import { Screen, TopBar } from '../ui/Layout';
import { QueueLine } from '../ui/visuals/Infographics';
import { Sheet } from '../ui/Sheet';
import { riseChild, spring, staggerParent } from '../ui/motion';

interface HospitalRow {
  id: string;
  name_hi: string;
  name_en: string;
  district: string;
  is_demo?: number;
}

interface TokenInfo {
  token: { id: string; number: number; status: 'waiting' | 'called' | 'in_consult' | 'done' | 'left'; priority: Priority; department_id: string };
  ahead: number;
  etaMin: number;
}

/** Digits that roll vertically when the number changes. */
function Rolling({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`tnum relative inline-flex overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-100%', opacity: 0 }} transition={spring.reveal}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default function Queue() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const scan = useScan();
  const [hospitals, setHospitals] = useState<HospitalRow[] | null>(null);
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [showOnBoard, setShowOnBoard] = useState(false);
  const joinRequest = useRef<string | null>(null);
  const lastAhead = useRef<number | null>(null);

  const poll = useCallback(async (id: string) => {
    try {
      const r = await api.getFresh<TokenInfo>(`/api/queue/${id}`);
      setInfo(r);
      setLastUpdate(Date.now());
      setError(null);
      const near = r.token.status === 'called' || (r.token.status === 'waiting' && r.ahead <= 2);
      if (near && lastAhead.current !== r.ahead) haptic([60, 80, 60]);
      lastAhead.current = r.ahead;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        scan.setToken(null);
        setInfo(null);
      }
      setError(t('common.offline'));
    }
  }, [t, scan.setToken]);

  useEffect(() => {
    if (scan.tokenId) {
      void poll(scan.tokenId);
      const id = setInterval(() => void poll(scan.tokenId!), 10_000);
      return () => clearInterval(id);
    }
    api.get<HospitalRow[]>('/api/queue/hospitals').then(setHospitals).catch(() => setError(t('common.offline')));
  }, [scan.tokenId, poll, t]);

  if (!scan.profile) return <Navigate to="/" replace />;

  const join = async (hospitalId: string) => {
    setJoining(hospitalId);
    setError(null);
    try {
      const sessionId = await scan.sync();
      if (!sessionId) throw new ApiError(0, 'offline');
      const demo = !!hospitals?.find((h) => h.id === hospitalId)?.is_demo;
      const r = await api.post<TokenInfo>('/api/queue/join', { sessionId, hospitalId, idempotencyKey: joinRequest.current ??= crypto.randomUUID(), showOnDemoBoard: demo && showOnBoard });
      scan.setToken(r.token.id);
      setInfo(r);
      setLastUpdate(Date.now());
      haptic([30, 50, 30]);
    } catch (e) {
      setError(e instanceof ApiError && e.status ? e.message : t('common.offline'));
    } finally {
      setJoining(null);
    }
  };

  if (!scan.tokenId || !info) {
    return (
      <Screen>
        <TopBar onBack={() => navigate('/card')} title={t('queue.title')} />
        <h1 className="mt-4 text-title-1 font-semibold">{t('queue.pick')}</h1>
        <p className="mt-2 text-body text-text-2">{t('queue.priorityNote')}</p>
        {hospitals?.some((h) => h.is_demo) && (
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-4">
            <input type="checkbox" checked={showOnBoard} onChange={(e) => setShowOnBoard(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
            <span>
              <span className="flex items-center gap-2 text-body-lg font-medium"><MonitorSmartphone size={18} aria-hidden /> {t('queue.showOnBoard')}</span>
              <span className="mt-1 block text-caption text-text-3">{t('queue.showOnBoardSub')}</span>
            </span>
          </label>
        )}
        <motion.ul variants={staggerParent} initial="hidden" animate="show" className="mt-4 flex flex-col gap-3">
          {hospitals === null && !error && [0, 1].map((i) => <li key={i} className="skeleton h-20 rounded-lg" />)}
          {hospitals?.map((h) => (
            <motion.li key={h.id} variants={riseChild}>
              <motion.button whileTap={{ scale: 0.98 }} disabled={!!joining} onClick={() => join(h.id)} className="flex w-full items-center gap-4 rounded-lg bg-surface p-4 text-left shadow-1 disabled:opacity-60">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-ink">
                  <Hospital size={24} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-title-3 font-semibold">{i18n.language === 'en' ? h.name_en : h.name_hi}</span>
                  <span className="text-caption text-text-3">{h.district}</span>
                </span>
                {joining === h.id && <motion.span className="size-5 rounded-full border-2 border-border border-t-accent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />}
              </motion.button>
            </motion.li>
          ))}
        </motion.ul>
        {error && <p className="mt-4 rounded-md bg-seetoday-tint px-4 py-3 text-body text-seetoday-ink">{error}</p>}
      </Screen>
    );
  }

  const { token, ahead, etaMin } = info;
  const deptCode = token.department_id.split(':')[1] as DepartmentId;
  const dept = departments[deptCode];
  const meta = PRIORITY_META[token.priority];
  const called = token.status === 'called' || token.status === 'in_consult';
  const done = token.status === 'done' || token.status === 'left';

  return (
    <Screen>
      <TopBar onBack={() => navigate('/card')} title={t('queue.title')} />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring.reveal} className="relative mt-4 overflow-hidden rounded-xl bg-surface p-6 text-center shadow-3">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: meta.cssVar }} />
        <p className="inline-flex items-center gap-2 text-label font-medium text-text-2">
          <Ticket size={18} aria-hidden /> {t('queue.token')}
        </p>
        <p className="tnum mt-2 text-hero-num font-semibold tracking-tight">{pickLang(dept, 'en').slice(0, 3).toUpperCase()}-{token.number}</p>
        <p className="mt-1 text-body-lg text-text-2">{pickLang(dept, i18n.language)}</p>
        <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium ${meta.chip}`}>
          <meta.icon size={14} aria-hidden /> {t(`card.${token.priority}`)}
        </span>
      </motion.div>

      {token.priority === 'emergency' && !done && (
        <a href="tel:108" className="mt-5 flex flex-col items-center gap-1 rounded-xl bg-emergency p-5 text-center text-emergency-on shadow-3">
          <span className="inline-flex items-center gap-2 text-title-3 font-semibold">
            <PhoneCall size={22} aria-hidden /> {t('card.call108')}
          </span>
          <span className="text-body opacity-90">{t('card.emergencySub')}</span>
        </a>
      )}

      <AnimatePresence mode="wait">
        {called ? (
          <motion.div key="called" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 flex items-center gap-3 rounded-lg bg-accent p-5 text-on-accent shadow-3">
            <motion.span animate={{ rotate: [0, -12, 12, -8, 8, 0] }} transition={{ duration: 0.8 }}>
              <BellRing size={28} aria-hidden />
            </motion.span>
            <span className="text-title-3 font-semibold">{t('queue.called')}</span>
          </motion.div>
        ) : done ? (
          <motion.p key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 rounded-lg bg-routine-tint p-5 text-center text-title-3 text-routine-ink">
            {t('queue.done')}
          </motion.p>
        ) : (
          <motion.div key="waiting" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5 grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-lg bg-surface p-4 shadow-1">
              <QueueLine ahead={ahead} you={t('queue.you')} />
            </div>
            <div className="rounded-lg bg-surface p-4 shadow-1">
              <Users size={20} className="text-text-3" aria-hidden />
              <Rolling value={ahead} className="mt-2 text-title-1 font-semibold" />
              <p className="text-caption text-text-3">{t('queue.aheadLabel')}</p>
            </div>
            <div className="rounded-lg bg-surface p-4 shadow-1">
              <Clock size={20} className="text-text-3" aria-hidden />
              <p className="mt-2 text-title-1 font-semibold">
                <Rolling value={etaMin} /> <span className="text-body text-text-3">{t('common.min')}</span>
              </p>
              <p className="text-caption text-text-3">{t('queue.etaLabel')}</p>
            </div>
            {ahead <= 2 && <p className="col-span-2 rounded-md bg-seetoday-tint px-4 py-3 text-body font-medium text-seetoday-ink">{t('queue.near')}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-5 text-center text-caption text-text-3">{t('queue.priorityNote')}</p>

      {lastUpdate && <p className="text-center text-caption text-text-3">{t('design.updated')} · <time>{new Date(lastUpdate).toLocaleTimeString(i18n.language === 'en' ? 'en-IN' : 'hi-IN')}</time></p>}
      {error && <p className="mt-3 text-emergency-text" role="alert">{error}</p>}
      <div className="mt-auto flex flex-col gap-1 pb-[max(16px,env(safe-area-inset-bottom))] pt-6">
        <Button variant="secondary" icon={IdCard} onClick={() => navigate('/card')}>
          {t('queue.openCard')}
        </Button>
        {(token.status === 'waiting' || token.status === 'called') && (
          <Button variant="ghost" icon={LogOut} className="w-full" onClick={() => setLeaving(true)}>
            {t('queue.leave')}
          </Button>
        )}
      </div>

      <Sheet open={leaving} onClose={() => setLeaving(false)} title={t('queue.leave')}>
        <div className="grid grid-cols-2 gap-3 py-3">
          <Button variant="secondary" onClick={() => setLeaving(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={async () => {
              try {
                await api.post(`/api/queue/${token.id}/leave`);
                joinRequest.current = null;
                scan.setToken(null);
                setInfo(null);
              } catch {
                setError(t('common.error'));
              }
              setLeaving(false);
            }}
          >
            {t('queue.leave')}
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}
