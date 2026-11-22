/** Classifies the device once at boot so CSS and motion can scale down on budget phones. */
export function detectPerfTier(): 'full' | 'lite' {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const lowMem = (nav.deviceMemory ?? 8) <= 4;
  const lowCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  const saveData = nav.connection?.saveData === true;
  return lowMem || lowCpu || saveData ? 'lite' : 'full';
}

export const perfTier = typeof navigator !== 'undefined' ? detectPerfTier() : 'full';

/** Keeps the sticky CTA above the iOS keyboard, which ignores interactive-widget. */
export function trackKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
}

export function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // iOS has no vibration API; haptics are a bonus.
  }
}
