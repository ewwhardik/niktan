/**
 * The logo animation in index.html stays over the app for at least one full cycle while the code,
 * fonts and face model the checks need load behind it, so the first tap after it fades feels
 * instant. It never waits longer than MAX_MS, even on a slow network.
 */
const CYCLE_MS = 2600;
const MAX_MS = 4200;

function warm(): Promise<unknown>[] {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  const frugal = nav.connection?.saveData === true || /(^|-)2g$/.test(nav.connection?.effectiveType ?? '');
  const jobs: Promise<unknown>[] = [
    document.fonts?.ready ?? Promise.resolve(),
    import('../pages/scan/ScanStep'),
    import('../pages/Consent'),
    import('../pages/HealthCard'),
  ];
  // The face model is a few MB; skip it on data saver. The service worker caches it for the scan.
  if (!frugal) {
    jobs.push(import('../cv/face').then(({ MODEL_URL }) => fetch(MODEL_URL, { priority: 'low' } as RequestInit)).catch(() => undefined));
    jobs.push(import('@mediapipe/tasks-vision').catch(() => undefined));
  }
  return jobs.map((job) => job.catch(() => undefined));
}

export function runBoot() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const started = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minimum = reduce ? 400 : CYCLE_MS;
  const ready = Promise.all(warm());
  const timeout = new Promise((resolve) => setTimeout(resolve, MAX_MS));
  void Promise.race([ready, timeout]).then(() => {
    const wait = Math.max(0, minimum - (performance.now() - started));
    setTimeout(() => {
      boot.classList.add('boot-out');
      boot.addEventListener('transitionend', () => boot.remove(), { once: true });
      setTimeout(() => boot.remove(), 900);
    }, wait);
  });
}
