import { AnimatePresence, motion } from 'motion/react';
import { Check, CircleCheck, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Priority } from '@niktan/core';
import { spring } from './motion';

export function ToggleChip({
  selected,
  onToggle,
  children,
  icon: Icon,
}: {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <motion.button
      type="button"
      layout
      whileTap={{ scale: 0.95 }}
      transition={spring.tap}
      aria-pressed={selected}
      onClick={onToggle}
      className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 py-2.5 text-label font-medium transition-colors duration-150 ${
        selected ? 'border-transparent bg-accent-soft text-accent-soft-ink' : 'border-border bg-surface text-text hover:bg-sunken'
      }`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {selected ? (
          <motion.span key="check" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring.tap}>
            <Check size={16} strokeWidth={2.25} aria-hidden />
          </motion.span>
        ) : (
          Icon && (
            <motion.span key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Icon size={16} strokeWidth={1.75} aria-hidden />
            </motion.span>
          )
        )}
      </AnimatePresence>
      {children}
    </motion.button>
  );
}

export const PRIORITY_META: Record<Priority, { icon: LucideIcon; chip: string; solid: string; cssVar: string }> = {
  emergency: { icon: OctagonAlert, chip: 'bg-emergency-tint text-emergency-ink', solid: 'bg-emergency text-emergency-on', cssVar: 'var(--emergency)' },
  today: { icon: TriangleAlert, chip: 'bg-seetoday-tint text-seetoday-ink', solid: 'bg-seetoday text-seetoday-on ring-1 ring-inset ring-seetoday-edge', cssVar: 'var(--seetoday)' },
  routine: { icon: CircleCheck, chip: 'bg-routine-tint text-routine-ink', solid: 'bg-routine text-routine-on', cssVar: 'var(--routine)' },
};

export type RowStatus = 'normal' | 'check' | 'refer' | 'none';

export function StatusChip({ status, label }: { status: RowStatus; label: string }) {
  const map: Record<RowStatus, { cls: string; icon?: LucideIcon }> = {
    normal: { cls: 'bg-routine-tint text-routine-ink', icon: CircleCheck },
    check: { cls: 'bg-seetoday-tint text-seetoday-ink', icon: TriangleAlert },
    refer: { cls: 'bg-seetoday-tint text-seetoday-ink', icon: TriangleAlert },
    none: { cls: 'bg-sunken text-text-3' },
  };
  const { cls, icon: Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium whitespace-nowrap ${cls}`}>
      {Icon && <Icon size={14} strokeWidth={2} aria-hidden />}
      {label}
    </span>
  );
}

export function SimBadge() {
  return <span className="rounded-xs border border-dashed border-sim px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-sim">SIM</span>;
}
