import { motion } from 'motion/react';
import { ArrowLeft, Languages } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGS } from '../i18n';
import { Sheet } from './Sheet';
import { spring } from './motion';

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`screen mx-auto flex w-full max-w-[480px] flex-col ${className}`}>{children}</div>;
}

export function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="cta-dock glass z-20 -mx-5 mt-auto px-5">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function LangToggle() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        whileTap={{ scale: 0.94 }}
        transition={spring.tap}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-label font-medium shadow-1"
        aria-label={t('common.language')}
      >
        <Languages size={18} strokeWidth={1.75} aria-hidden />
        {LANGS.find((l) => l.id === i18n.language)?.label ?? 'हिंदी'}
      </motion.button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('common.language')}>
        <div className="flex flex-col gap-2 py-2">
          {LANGS.map((l) => (
            <button
              key={l.id}
              lang={l.id}
              onClick={() => {
                void i18n.changeLanguage(l.id);
                setOpen(false);
              }}
              className={`flex min-h-14 items-center justify-between rounded-md border px-4 text-title-3 ${
                i18n.language === l.id ? 'border-transparent bg-accent-soft text-accent-soft-ink' : 'border-border'
              }`}
            >
              {l.label}
              {i18n.language === l.id && <span className="size-2.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

export function TopBar({ onBack, title, right }: { onBack?: () => void; title?: ReactNode; right?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className="flex min-h-12 items-center justify-between gap-3 pb-2">
      {onBack ? (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          aria-label={t('common.back')}
          className="-ml-2 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-sunken"
        >
          <ArrowLeft size={24} strokeWidth={1.75} />
        </motion.button>
      ) : (
        <span className="size-12" />
      )}
      <div className="min-w-0 flex-1 truncate text-center text-label font-medium text-text-2">{title}</div>
      {right ?? <LangToggle />}
    </header>
  );
}

/** Thin segmented progress bar for the 5 scan steps. */
export function Stepper({ index, total, label }: { index: number; total: number; label: string }) {
  return (
    <div className="flex flex-col gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-label={label}>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full origin-left rounded-full bg-accent"
              initial={false}
              animate={{ scaleX: i < index ? 1 : i === index ? 0.5 : 0 }}
              transition={spring.reveal}
            />
          </div>
        ))}
      </div>
      <span className="text-caption text-text-3">{label}</span>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg bg-surface p-5 shadow-1 ${className}`}>{children}</div>;
}

export function Disclaimer() {
  const { t } = useTranslation();
  return <p className="rounded-md bg-sunken px-4 py-3 text-center text-caption text-text-2">{t('app.notDiagnosis')}</p>;
}
