import { motion } from 'motion/react';
import { ArrowLeft, Clock, Eye, Kanban, LogOut, Server, Star, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { departments, type DepartmentId, type Priority } from '@niktan/core';
import { pickLang } from '../../i18n';
import { api } from '../../lib/api';
import { PRIORITY_META } from '../../ui/Chip';
import { CountUp } from '../../ui/Numbers';
import { riseChild, spring, staggerParent } from '../../ui/motion';
import { logout, useStaff } from './staff';

interface Stats {
  priorities: { priority: Priority; simulated: number; n: number }[];
  departments: { code: string; waiting: number; done: number; total: number }[];
  waits: { priority: Priority; avg_wait_min: number; n: number }[];
  flags: { pallor: number | null; jaundice: number | null; cataract: number | null; n: number } | undefined;
  scans: { hour: number; real: number; sim: number }[];
  feedback: { avg_rating: number | null; would_use: number | null; last_wait: number | null; n: number } | undefined;
  consults: { avg_consult_min: number | null; n: number } | undefined;
}

interface Status {
  version: string;
  db: boolean;
  providers: Record<string, boolean>;
  last24h: { provider: string; kind: string; ok: number; total: number; avg_ms: number }[];
}

function Panel({ title, icon: Icon, children, className = '' }: { title: string; icon: typeof Users; children: React.ReactNode; className?: string }) {
  return (
    <motion.section variants={riseChild} className={`rounded-lg bg-surface p-5 shadow-1 ${className}`}>
      <h2 className="flex items-center gap-2 text-label font-semibold text-text-2">
        <Icon size={16} aria-hidden /> {title}
      </h2>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

function HBar({ label, value, max, color }: { label: React.ReactNode; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-body">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-sunken">
        <motion.div className="h-full origin-left rounded-full" style={{ background: color }} initial={{ scaleX: 0 }} animate={{ scaleX: max ? value / max : 0 }} transition={spring.reveal} />
      </div>
      <span className="tnum w-10 text-right text-body font-medium">{Math.round(value * 10) / 10}</span>
    </div>
  );
}

export default function Admin() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const staff = useStaff();
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  const load = useCallback(async () => {
    if (!staff) return;
    const [s, st] = await Promise.all([api.get<Stats>(`/api/hospital/${staff.hid}/stats`).catch(() => null), api.get<Status>('/api/status').catch(() => null)]);
    if (s) setStats(s);
    if (st) setStatus(st);
  }, [staff]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, [load]);

  const byPriority = (['emergency', 'today', 'routine'] as Priority[]).map((p) => ({ p, n: stats?.priorities.filter((x) => x.priority === p).reduce((s, x) => s + x.n, 0) ?? 0 }));
  const totalPatients = byPriority.reduce((s, x) => s + x.n, 0);
  const realPatients = stats?.priorities.filter((x) => !x.simulated).reduce((s, x) => s + x.n, 0) ?? 0;
  const maxDept = Math.max(1, ...(stats?.departments.map((d) => d.total) ?? [1]));
  const maxWait = Math.max(1, ...(stats?.waits.map((w) => w.avg_wait_min) ?? [1]));
  const scansMax = Math.max(1, ...(stats?.scans.map((s) => s.real + s.sim) ?? [1]));
  const flags = stats?.flags;
  const pct = (v: number | null | undefined) => (flags?.n ? Math.round(((v ?? 0) / flags.n) * 100) : 0);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="glass sticky top-0 z-20 border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <button onClick={() => navigate('/hospital/board')} aria-label={t('hospital.board')} className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-sunken">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-title-2 font-semibold">{t('hospital.admin')}</h1>
          <div className="ml-auto flex gap-2">
            <button onClick={() => navigate('/hospital/board')} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-label">
              <Kanban size={16} aria-hidden /> {t('hospital.board')}
            </button>
            <button
              onClick={async () => {
                if (!staff) return;
                await api.post(`/api/hospital/${staff.hid}/simulate/clear`).catch(() => undefined);
                void load();
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-label"
            >
              <Trash2 size={16} aria-hidden /> {t('hospital.clear')}
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate('/hospital');
              }}
              aria-label={t('hospital.logout')}
              className="inline-flex size-11 items-center justify-center rounded-full hover:bg-sunken"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <motion.main variants={staggerParent} initial="hidden" animate="show" className="mx-auto grid max-w-6xl gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
        <Panel title={lang === 'en' ? "Today's patients" : 'आज के मरीज़'} icon={Users}>
          <p className="text-hero-num font-semibold tracking-tight">
            <CountUp value={totalPatients} />
          </p>
          <p className="text-caption text-text-3">
            {realPatients} real · {totalPatients - realPatients} SIM
          </p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-sunken">
            {byPriority.map(({ p, n }) => (
              <motion.div key={p} className="h-full" style={{ background: PRIORITY_META[p].cssVar }} initial={{ width: 0 }} animate={{ width: totalPatients ? `${(n / totalPatients) * 100}%` : 0 }} transition={spring.reveal} />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-3">
            {byPriority.map(({ p, n }) => (
              <li key={p} className="inline-flex items-center gap-1.5 text-caption">
                <span className="size-2.5 rounded-full" style={{ background: PRIORITY_META[p].cssVar }} /> {t(`card.${p}`)} <span className="tnum font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={lang === 'en' ? 'Average wait until called (min)' : 'बुलाए जाने तक औसत इंतज़ार (मिनट)'} icon={Clock}>
          <div className="flex flex-col gap-3">
            {(['emergency', 'today', 'routine'] as Priority[]).map((p) => {
              const w = stats?.waits.find((x) => x.priority === p);
              return <HBar key={p} label={t(`card.${p}`)} value={w?.avg_wait_min ?? 0} max={maxWait} color={PRIORITY_META[p].cssVar} />;
            })}
          </div>
          <p className="mt-3 text-caption text-text-3">{lang === 'en' ? 'Priority order means urgent patients wait least.' : 'प्राथमिकता से गंभीर मरीज़ सबसे कम इंतज़ार करते हैं।'}</p>
        </Panel>

        <Panel title={lang === 'en' ? 'Screening flags (24 h)' : 'जाँच संकेत (24 घंटे)'} icon={Eye}>
          <div className="flex flex-col gap-3">
            <HBar label={t('card.pallor')} value={pct(flags?.pallor)} max={100} color="var(--accent)" />
            <HBar label={t('card.jaundice')} value={pct(flags?.jaundice)} max={100} color="var(--accent)" />
            <HBar label={t('card.cataract')} value={pct(flags?.cataract)} max={100} color="var(--accent)" />
          </div>
          <p className="mt-3 text-caption text-text-3">% of {flags?.n ?? 0} eye scans</p>
        </Panel>

        <Panel title={lang === 'en' ? 'Department load' : 'विभाग पर भार'} icon={Kanban} className="md:col-span-2 xl:col-span-1">
          <div className="flex flex-col gap-3">
            {stats?.departments
              .slice()
              .sort((a, b) => b.total - a.total)
              .map((d) => (
                <HBar key={d.code} label={pickLang(departments[d.code as DepartmentId] ?? { hi: d.code, en: d.code }, lang)} value={d.total} max={maxDept} color="var(--accent)" />
              ))}
          </div>
        </Panel>

        <Panel title={lang === 'en' ? 'Screenings per hour (24 h)' : 'प्रति घंटे जाँच (24 घंटे)'} icon={Users}>
          <div className="flex h-28 items-end gap-1">
            {stats?.scans.map((s) => (
              <div key={s.hour} className="flex flex-1 flex-col justify-end" title={new Date(s.hour).toLocaleTimeString()}>
                <motion.div className="rounded-t-[3px] bg-[var(--accent)]/30" initial={{ height: 0 }} animate={{ height: `${(s.sim / scansMax) * 100}%` }} transition={spring.reveal} />
                <motion.div className="rounded-t-[3px] bg-accent" initial={{ height: 0 }} animate={{ height: `${(s.real / scansMax) * 100}%` }} transition={spring.reveal} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={lang === 'en' ? 'Feedback & consults' : 'फ़ीडबैक और परामर्श'} icon={Star}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="tnum text-title-1 font-semibold">{stats?.feedback?.avg_rating ? stats.feedback.avg_rating.toFixed(1) : '—'}★</p>
              <p className="text-caption text-text-3">{stats?.feedback?.n ?? 0} ratings</p>
            </div>
            <div>
              <p className="tnum text-title-1 font-semibold">{stats?.feedback?.would_use != null ? `${Math.round(stats.feedback.would_use * 100)}%` : '—'}</p>
              <p className="text-caption text-text-3">would use</p>
            </div>
            <div>
              <p className="tnum text-title-1 font-semibold">{stats?.feedback?.last_wait != null ? Math.round(stats.feedback.last_wait) : '—'}</p>
              <p className="text-caption text-text-3">last OPD wait (min, self-reported)</p>
            </div>
            <div>
              <p className="tnum text-title-1 font-semibold">{stats?.consults?.avg_consult_min != null ? stats.consults.avg_consult_min.toFixed(1) : '—'}</p>
              <p className="text-caption text-text-3">avg consult (min, n={stats?.consults?.n ?? 0})</p>
            </div>
          </div>
        </Panel>

        <Panel title={lang === 'en' ? 'System status' : 'सिस्टम स्थिति'} icon={Server} className="md:col-span-2 xl:col-span-3">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-caption font-medium ${status?.db ? 'bg-routine-tint text-routine-ink' : 'bg-emergency-tint text-emergency-ink'}`}>DB {status?.db ? 'OK' : '—'}</span>
            {Object.entries(status?.providers ?? {}).map(([k, v]) => (
              <span key={k} className={`rounded-full px-3 py-1 text-caption font-medium ${v ? 'bg-routine-tint text-routine-ink' : 'bg-sunken text-text-3'}`}>
                {k} {v ? 'configured' : 'off'}
              </span>
            ))}
            <span className="rounded-full bg-sunken px-3 py-1 text-caption text-text-3">v{status?.version}</span>
          </div>
          {!!status?.last24h.length && (
            <table className="mt-4 w-full text-left text-body">
              <thead className="text-caption text-text-3">
                <tr>
                  <th className="py-1 font-medium">Provider</th>
                  <th className="font-medium">Kind</th>
                  <th className="font-medium">Success</th>
                  <th className="font-medium">Avg ms</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {status.last24h.map((r) => (
                  <tr key={r.provider + r.kind} className="border-t border-border">
                    <td className="py-1.5">{r.provider}</td>
                    <td>{r.kind}</td>
                    <td>
                      {r.ok}/{r.total}
                    </td>
                    <td>{Math.round(r.avg_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </motion.main>
    </div>
  );
}
