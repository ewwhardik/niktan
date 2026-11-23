import { motion } from 'motion/react';
import { ArrowLeft, Ear, Eye, Glasses, HeartPulse, Languages, Mic } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGS } from '../i18n';
import { Sheet } from './Sheet';
import { spring } from './motion';

/** Desktop brand panel beside citizen screens: keeps laptops from showing a lone phone-width column. */
function Aside({ title }: { title?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <aside className="chamber sticky top-0 hidden h-dvh flex-col justify-between overflow-hidden p-12 text-text lg:flex">
      <a href="/" className="flex items-center gap-2.5">
        <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
          <rect width="32" height="32" rx="9" fill="currentColor" />
          <path d="M6 17h5l2.5-6 3.5 11 3-8 1.6 3H26" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-title-3 font-semibold">NikTan</span>
      </a>
      <ol className="relative flex max-w-sm flex-col gap-1">
        {[HeartPulse, Eye, Glasses, Ear, Mic].map((Icon, i) => {
          const key = ['face', 'eye', 'vision', 'hearing', 'symptoms'][i]!;
          return (
            <motion.li key={key} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-4 border-b border-white/[0.08] py-3.5 last:border-b-0">
              <span className="grid size-10 place-items-center rounded-2xl bg-white/[0.07]"><Icon size={18} strokeWidth={1.7} aria-hidden /></span>
              <span className="text-body-lg text-text-2">{t(`steps.${key}`)}</span>
              <span className="mono ml-auto text-caption text-text-3">0{i + 1}</span>
            </motion.li>
          );
        })}
      </ol>
      <div className="relative max-w-md">
        <p className="serif text-[clamp(2.75rem,4.5vw,4.5rem)] leading-[1.02]">{title ?? t('home.endTitle')}</p>
        <p className="mt-6 max-w-sm text-body text-text-3">{t('home.footer')}</p>
      </div>
    </aside>
  );
}

export function Screen({ children, className = '', aside, wide = false }: { children: ReactNode; className?: string; aside?: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(380px,0.85fr)_minmax(0,1.15fr)]">
      <Aside title={aside} />
      <div className={`screen mx-auto flex w-full flex-col lg:px-12 lg:pt-10 ${wide ? 'max-w-[760px]' : 'max-w-[520px] lg:max-w-[600px]'} ${className}`}>{children}</div>
    </div>
  );
}

export function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="cta-dock glass z-20 -mx-5 mt-auto px-5 lg:mx-0 lg:mt-10 lg:bg-transparent lg:px-0 lg:pb-10 lg:backdrop-blur-none">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        whileTap={{ scale: 0.94 }}
        transition={spring.tap}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 text-label font-medium shadow-1"
        aria-label={t('common.language')}
      >
        <Languages size={18} strokeWidth={1.75} aria-hidden />
        <span className={compact ? 'hidden sm:inline' : ''}>{LANGS.find((l) => l.id === i18n.language)?.label ?? 'English'}</span>
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
