import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Activity, ChartColumn, HeartPulse, LogOut, Megaphone, Play, Radio, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { departments, type DepartmentId, type Priority, type Reason } from '@niktan/core';
import { pickLang } from '../../i18n';
import { api } from '../../lib/api';
import { PRIORITY_META, SimBadge } from '../../ui/Chip';
import { LangToggle } from '../../ui/Layout';
import { spring } from '../../ui/motion';
import { logout, useStaff } from './staff';

interface Tile {
  id: string;
  number: number;
  priority: Priority;
  status: 'waiting' | 'called' | 'in_consult';
  age: number;
  sex: string;
  waitedMin: number;
  simulated: boolean;
  heartRate: number | null;
  flags: string[];
  reasons: Reason[];
}

const ORDER: DepartmentId[] = ['emergency', 'medicine', 'paediatrics', 'gynaecology', 'ophthalmology', 'ent', 'orthopaedics', 'surgery', 'dermatology', 'dental'];

function TileCard({ tile, onAction, onOpen }: { tile: Tile; onAction: (a: 'call' | 'start') => void; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const meta = PRIORITY_META[tile.priority];
  const active = tile.status !== 'waiting';
  return (
    <motion.li
      layout
      layoutId={tile.id}
      initial={{ opacity: 0, scale: 0.9, y: -12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={spring.layout}
      className={`verdict-glow relative overflow-hidden rounded-md bg-surface shadow-1 ${tile.simulated ? 'outline outline-1 outline-dashed outline-sim/50' : ''}`}
      style={{ ['--verdict' as string]: meta.cssVar, ['--glow' as string]: tile.priority === 'emergency' ? 1 : 0 }}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: meta.cssVar }} />
      <button onClick={onOpen} className="block w-full py-3 pr-3 pl-5 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="tnum text-title-3 font-semibold">#{tile.number}</span>
          <span className="flex items-center gap-1.5">
            {tile.simulated && <SimBadge />}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium ${meta.chip}`}>
              <meta.icon size={13} aria-hidden /> {t(`card.${tile.priority}`)}
            </span>
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-caption text-text-2">
          <span>
            {tile.age} · {tile.sex === 'female' ? 'F' : tile.sex === 'male' ? 'M' : 'O'}
          </span>
          {tile.heartRate && (
            <span className="tnum inline-flex items-center gap-1">
              <HeartPulse size={13} aria-hidden /> {tile.heartRate}
            </span>
          )}
          <span className="tnum ml-auto">{t('hospital.waited', { n: tile.waitedMin })}</span>
        </div>
        {tile.reasons.length > 0 && <p className="mt-1.5 line-clamp-2 text-caption text-text-3">{tile.reasons.slice(0, 2).map((r) => pickLang(r, i18n.language)).join(' · ')}</p>}
      </button>
      <div className="flex border-t border-border">
          {active ? (
            <span className="flex min-h-11 flex-1 items-center justify-center gap-1.5 text-caption font-medium text-accent-text">
              <Activity size={14} aria-hidden /> {tile.status === 'called' ? t('hospital.called') : t('hospital.inConsult')}
            </span>
          ) : (
            <button onClick={() => onAction('call')} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 text-caption font-medium hover:bg-sunken">
              <Megaphone size={14} aria-hidden /> {t('hospital.call')}
            </button>
          )}
          {tile.status !== 'in_consult' && (
            <button onClick={() => onAction('start')} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 border-l border-border text-caption font-medium hover:bg-sunken">
              <Play size={14} aria-hidden /> {t('hospital.start')}
            </button>
          )}
      </div>
    </motion.li>
  );
}

export default function Board() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const staff = useStaff();
  const [columns, setColumns] = useState<Record<string, Tile[]>>({});
  const [updated, setUpdated] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!staff) return;
    try {
      const r = await api.get<{ columns: Record<string, Tile[]>; updatedAt: number }>(`/api/hospital/${staff.hid}/board`);
      setColumns(r.columns);
      setUpdated(r.updatedAt);
    } catch {
      setFailed(true);
    }
  }, [staff]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const act = async (id: string, a: 'call' | 'start') => {
    try { await api.post(`/api/hospital/tokens/${id}/${a}`); } catch { setFailed(true); return; }
    if (a === 'start') navigate(`/hospital/token/${id}`);
    else void load();
  };

  const simulate = async (scenario: 'random' | 'hidden_emergency') => {
    if (!staff) return;
    setBusy(true);
    await api.post(`/api/hospital/${staff.hid}/simulate`, { count: scenario === 'hidden_emergency' ? 20 : 6, scenario }).catch(() => setFailed(true));
    setBusy(false);
    void load();
  };

  const codes = ORDER.filter((c) => columns[c]?.length).concat(Object.keys(columns).filter((c) => !ORDER.includes(c as DepartmentId)) as DepartmentId[]);
  const total = Object.values(columns).reduce((s, c) => s + c.length, 0);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="glass sticky top-0 z-20 border-b border-border">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-5 py-3">
          <h1 className="text-title-2 font-semibold">{t('hospital.board')}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-routine-tint px-2.5 py-1 text-caption font-medium text-routine-ink">
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
              <Radio size={13} aria-hidden />
            </motion.span>
            {t('hospital.live')} · <span className="tnum">{total}</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {staff?.role === 'admin' && staff.demoMode && (
              <>
                <button disabled={busy} onClick={() => simulate('random')} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-label hover:bg-sunken disabled:opacity-50">
                  <UserPlus size={16} aria-hidden /> {t('hospital.simulate')}
                </button>
                <button disabled={busy} onClick={() => simulate('hidden_emergency')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-3 text-label font-medium text-on-accent disabled:opacity-50">
                  <Play size={16} aria-hidden /> {t('hospital.demo')}
                </button>
              </>
            )}
            {staff?.role === 'admin' && (
              <button onClick={() => navigate('/hospital/admin')} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-label hover:bg-sunken">
                <ChartColumn size={16} aria-hidden /> {t('hospital.admin')}
              </button>
            )}
            <LangToggle />
            <button
              onClick={async () => {
                await logout();
                navigate('/hospital');
              }}
              aria-label={t('hospital.logout')}
              className="inline-flex size-11 items-center justify-center rounded-full text-text-2 hover:bg-sunken"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-5">
        {failed && <button className="min-h-11 text-emergency-text" onClick={() => { setFailed(false); void load(); }}>{t('common.error')} · {t('common.retry')}</button>}
        {codes.length === 0 ? (
          <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-text-3">
            <HeartPulse size={40} strokeWidth={1.25} aria-hidden />
            <p className="text-body-lg">{updated ? t('hospital.empty') : t('common.loading')}</p>
          </div>
        ) : (
          <LayoutGroup>
            <div className="flex snap-x gap-4 overflow-x-auto pb-4 no-scrollbar lg:grid lg:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] lg:overflow-visible">
              {codes.map((code) => (
                <motion.section layout key={code} className="w-[85vw] max-w-[340px] shrink-0 snap-start lg:w-auto lg:max-w-none">
                  <h2 className="mb-2 flex items-center justify-between px-1 text-label font-semibold text-text-2">
                    <span>{departments[code] ? pickLang(departments[code], i18n.language) : code}</span>
                    <span className="tnum rounded-full bg-sunken px-2 py-0.5 text-caption">{columns[code]!.length}</span>
                  </h2>
                  <ul className="flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {columns[code]!.map((tile) => (
                        <TileCard key={tile.id} tile={tile} onAction={(a) => void act(tile.id, a)} onOpen={() => navigate(`/hospital/token/${tile.id}`)} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </motion.section>
              ))}
            </div>
          </LayoutGroup>
        )}
      </main>
    </div>
  );
}
