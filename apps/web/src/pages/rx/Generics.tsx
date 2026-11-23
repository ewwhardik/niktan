import { motion } from 'motion/react';
import { BadgeIndianRupee, ExternalLink, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Generic {
  code: string;
  name: string;
  unit: string;
  mrp: number;
  group: string;
  perUnit: number | null;
  score: number;
  exact: boolean;
  savingPercent?: number | null;
}

export interface Dataset {
  name: string;
  count: number;
  url: string;
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Jan Aushadhi equivalents with their government MRP; never presented as a prescription change. */
export function GenericList({ generics, dataset, compact = false }: { generics: Generic[]; dataset?: Dataset; compact?: boolean }) {
  const { t } = useTranslation();
  if (dataset && dataset.count === 0) return <p className="rounded-2xl bg-sunken p-4 text-body text-text-2">{t('saver.listPending')}</p>;
  if (!generics.length) return <p className="rounded-2xl bg-sunken p-4 text-body text-text-2">{t('saver.noMatch')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {generics.map((g, i) => (
          <motion.li key={g.code + g.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className={`rounded-2xl bg-surface ring-1 ring-border ${compact ? 'p-3.5' : 'p-4 shadow-1'}`}>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-routine-tint text-routine-ink"><BadgeIndianRupee size={18} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium break-words">{g.name}</p>
                <p className="mt-0.5 text-caption text-text-3">
                  {t('saver.pack')}: {g.unit || '—'}{g.code ? ` · ${t('saver.code')} ${g.code}` : ''}
                </p>
                {!g.exact && <p className="mt-1 text-caption text-seetoday-text">{t('saver.notExact')}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-title-3 font-semibold">{rupees(g.mrp)}</p>
                {g.perUnit !== null && <p className="tnum text-caption text-text-3">{t('saver.perUnit', { price: rupees(g.perUnit) })}</p>}
                {!!g.savingPercent && <p className="tnum mt-1 inline-block rounded-full bg-routine-tint px-2 py-0.5 text-caption font-semibold text-routine-ink">{t('saver.save', { pct: g.savingPercent })}</p>}
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-3">
        <a href="https://janaushadhi.gov.in/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2"><MapPin size={11} aria-hidden /> {t('saver.findKendra')}</a>
        {dataset && <a href={dataset.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">{t('saver.source')} <ExternalLink size={11} aria-hidden /></a>}
      </p>
    </div>
  );
}
