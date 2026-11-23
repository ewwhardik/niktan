import { motion } from 'motion/react';
import { Gauge, ThumbsUp, Timer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Priority } from '@niktan/core';
import { api } from '../../lib/api';
import { PRIORITY_META } from '../../ui/Chip';
import { spring } from '../../ui/motion';
import type { Staff } from './staff';

interface PriorityImpact {
  n: number;
  actualMin: number | null;
  fcfsMin: number | null;
  savedMin: number | null;
}

interface ImpactBlock {
  visits: number;
  called: number;
  simulatedVisits: number;
  priorities: Record<Priority, PriorityImpact>;
  urgent: PriorityImpact;
  consultMin: number | null;
  consults: number;
  historyUseful: { share: number | null; n: number };
}

interface ImpactResponse {
  real: ImpactBlock;
  all: ImpactBlock & { includesSimulated: boolean };
}

const PRIORITIES: Priority[] = ['emergency', 'today', 'routine'];

/**
 * Today's priority queue against the first-come-first-served line the same patients would have
 * stood in. Public demo accounts only see simulated visits (and visits a citizen chose to show), so
 * they read the combined block; hospital accounts read real visits only.
 */
export function useImpact(staff: Staff | null, everyMs = 10_000): ImpactBlock | null {
  const [data, setData] = useState<ImpactBlock | null>(null);
  const load = useCallback(async () => {
    if (!staff) return;
    const r = await api.get<ImpactResponse>(`/api/hospital/${staff.hid}/impact`).catch(() => null);
    if (r) setData(staff.demoOnly ? r.all : r.real);
  }, [staff]);
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), everyMs);
    return () => clearInterval(id);
  }, [load, everyMs]);
  return data;
}

const fmt = (n: number | null) => (n === null ? '—' : String(Math.round(n)));

/** One line under the board header: the before/after number staff and judges look for. */
export function ImpactStrip({ impact }: { impact: ImpactBlock | null }) {
  const { t } = useTranslation();
  if (!impact) return null;
  const urgent = impact.urgent;
  const hasData = urgent.n > 0 && urgent.savedMin !== null;
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.reveal}
      aria-label={t('impact.title')}
      className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-surface px-4 py-3 shadow-1"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-routine-tint text-routine-ink">
          <Gauge size={20} aria-hidden />
        </span>
        <div className="leading-tight">
          <p className="text-caption text-text-3">{t('impact.title')}</p>
          {hasData ? (
            <p className="text-body-lg font-semibold">
              {urgent.savedMin! >= 0
                ? t('impact.urgentSooner', { n: fmt(urgent.savedMin) })
                : t('impact.urgentLater', { n: fmt(-urgent.savedMin!) })}
            </p>
          ) : (
            <p className="text-body text-text-2">{t('impact.empty')}</p>
          )}
        </div>
      </div>
      {hasData && (
        <ul className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => {
            const row = impact.priorities[p];
            if (!row.n) return null;
            const meta = PRIORITY_META[p];
            return (
              <li key={p} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-medium ${meta.chip}`}>
                <meta.icon size={13} aria-hidden />
                <span>{t(`card.${p}`)}</span>
                <span className="tnum">
                  {t('impact.pair', { actual: fmt(row.actualMin), fcfs: fmt(row.fcfsMin) })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="tnum ml-auto text-caption text-text-3">
        {t('impact.called', { n: impact.called, total: impact.visits })}
        {impact.historyUseful.n > 0 && ` · ${t('impact.useful', { pct: Math.round((impact.historyUseful.share ?? 0) * 100), n: impact.historyUseful.n })}`}
      </p>
    </motion.section>
  );
}

/** Admin dashboard version: per-priority bars, actual wait against first-come-first-served. */
export function ImpactPanel({ impact }: { impact: ImpactBlock | null }) {
  const { t } = useTranslation();
  if (!impact) return <p className="text-body text-text-3">{t('common.loading')}</p>;
  const rows = PRIORITIES.map((p) => ({ p, ...impact.priorities[p] })).filter((r) => r.n > 0);
  if (!rows.length) return <p className="text-body text-text-2">{t('impact.empty')}</p>;
  const max = Math.max(1, ...rows.flatMap((r) => [r.actualMin ?? 0, r.fcfsMin ?? 0]));
  return (
    <div className="flex flex-col gap-5">
      {rows.map((r) => {
        const meta = PRIORITY_META[r.p];
        return (
          <div key={r.p}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-body">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <meta.icon size={15} aria-hidden style={{ color: meta.cssVar }} /> {t(`card.${r.p}`)}
                <span className="tnum text-caption text-text-3">· {r.n}</span>
              </span>
              <span className={`tnum text-label font-semibold ${r.savedMin !== null && r.savedMin < 0 ? 'text-text-2' : 'text-routine-ink'}`}>
                {r.savedMin === null ? '—' : r.savedMin >= 0 ? t('impact.sooner', { n: fmt(r.savedMin) }) : t('impact.later', { n: fmt(-r.savedMin) })}
              </span>
            </div>
            {[
              { label: t('impact.withNikTan'), v: r.actualMin, color: meta.cssVar },
              { label: t('impact.fcfs'), v: r.fcfsMin, color: 'var(--border-strong)' },
            ].map((bar) => (
              <div key={bar.label} className="mt-1 flex items-center gap-3">
                <span className="w-28 shrink-0 text-caption text-text-3">{bar.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <motion.div className="h-full origin-left rounded-full" style={{ background: bar.color }} initial={{ scaleX: 0 }} animate={{ scaleX: (bar.v ?? 0) / max }} transition={spring.reveal} />
                </div>
                <span className="tnum w-14 text-right text-caption font-medium">{fmt(bar.v)} min</span>
              </div>
            ))}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-caption text-text-2">
        <span className="inline-flex items-center gap-1.5"><Timer size={14} aria-hidden /> {t('impact.consult', { n: impact.consultMin ?? '—', c: impact.consults })}</span>
        {impact.historyUseful.n > 0 && (
          <span className="inline-flex items-center gap-1.5"><ThumbsUp size={14} aria-hidden /> {t('impact.useful', { pct: Math.round((impact.historyUseful.share ?? 0) * 100), n: impact.historyUseful.n })}</span>
        )}
      </div>
      <p className="text-caption text-text-3">{t('impact.method')}</p>
    </div>
  );
}
