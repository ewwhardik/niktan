import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { spring } from './motion';

/** Bottom sheet with drag-to-dismiss, scrim tap and Escape. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const drag = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-[520px] overflow-y-auto rounded-t-xl bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring.sheet}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pt-3 pb-2" onPointerDown={(e) => drag.start(e)} style={{ touchAction: 'none' }}>
              <div className="mx-auto h-1.5 w-9 rounded-full bg-border" />
              {title && <h2 className="mt-3 text-title-2 font-semibold">{title}</h2>}
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
