import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { perfTier } from '../../lib/perf';
import type { StepKey } from './StepVisual';

type Phone3DModule = typeof import('../three/Phone3D');
/** Once the module has arrived it is used directly, so a cached load never flashes the fallback. */
let ready: Phone3DModule['default'] | null = null;
const load = () => import('../three/Phone3D').then((m) => { ready = m.default; return m; });
const Phone3DLazy = lazy(load);

/** Starts the three.js download once, in the background, so it is ready before anyone scrolls to it. */
let prefetched = false;
function prefetch() {
  if (prefetched) return;
  prefetched = true;
  load().catch(() => { prefetched = false; });
}

/** Queue the prefetch for when the page has finished loading and the main thread is idle. */
function whenIdle(run: () => void) {
  const idle = (cb: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 800 }) : setTimeout(cb, 1200));
  if (document.readyState === 'complete') idle(run);
  else window.addEventListener('load', () => idle(run), { once: true });
}

/** Same accents as the 3D phone, for glows drawn outside the canvas. */
export const ACCENT_GLOW: Record<StepKey, string> = {
  face: '#ff453a',
  eye: '#64d2ff',
  vision: '#5e8bff',
  hearing: '#30d5c8',
  symptoms: '#bf5af2',
};

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The real-time 3D phone for "How it works", loaded on demand. Low-memory phones and browsers
 * without WebGL get `fallback` instead, as does any device where the 3D view fails to start.
 */
export function Stage3D({ steps, active, compact = false, fallback, className = '' }: { steps: { k: StepKey; t: string }[]; active: number; compact?: boolean; fallback: ReactNode; className?: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const can = useMemo(() => perfTier !== 'lite' && webglAvailable(), []);
  // three.js is large: download it in the background once the page is idle, and mount the
  // canvas a couple of screens early so it is drawn and warmed up before it scrolls into view.
  useEffect(() => { if (can) whenIdle(prefetch); }, [can]);
  const [near, setNear] = useState(false);
  const probe = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = probe.current;
    if (!el || near || !can) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) setNear(true); }, { rootMargin: '250% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near, can]);
  const withChips = useMemo(
    () => steps.map((s) => ({ ...s, chips: t(`home.stage.${s.k}`, { returnObjects: true }) as { label: string; value: string }[] })),
    [steps, t],
  );
  if (!can || failed) return <>{fallback}</>;
  // Until the 3D phone is ready, the CSS phone holds its place so the section is never empty.
  if (!near) return <div ref={probe} className={className}>{fallback}</div>;
  const Phone3D = ready ?? Phone3DLazy;
  return (
    <Suspense fallback={<div className={className}>{fallback}</div>}>
      <Phone3D steps={withChips} active={active} compact={compact} onFail={() => setFailed(true)} className={className} />
    </Suspense>
  );
}
