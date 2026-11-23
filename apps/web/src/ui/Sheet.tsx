import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { spring } from './motion';

function SheetPanel({ onClose, title, children }: { onClose: () => void; title?: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const drag = useDragControls();
  const reduced = useReducedMotion();
  const { t } = useTranslation();

  useLayoutEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby={title ? heading : undefined} aria-label={title ? undefined : t('common.done')}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-text backdrop:bg-transparent">
      <motion.div aria-hidden className="absolute inset-0 bg-[var(--scrim)]" onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.16 }} />
      <motion.section
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-[520px] overflow-y-auto overscroll-contain rounded-t-xl bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-4 sm:bottom-6 sm:rounded-xl"
        initial={{ y: reduced ? 0 : 36, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: reduced ? 0 : 20, opacity: 0 }} transition={reduced ? { duration: 0 } : spring.sheet}
        drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}>
        <header className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-2">
          <div aria-hidden onPointerDown={(e) => drag.start(e)} className="flex h-6 touch-none items-center justify-center">
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </div>
          <div className="flex items-center justify-between gap-4">
            {title && <h2 id={heading} className="text-title-2 font-semibold">{title}</h2>}
            <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="ml-auto grid size-11 shrink-0 place-items-center rounded-full bg-sunken text-text-2 hover:text-text"><X size={18} /></button>
          </div>
        </header>
        {children}
      </motion.section>
    </dialog>
  );
}

export function Sheet({ open, ...props }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return <AnimatePresence>{open && <SheetPanel key="sheet" {...props} />}</AnimatePresence>;
}
