/**
 * Red-green colour vision screen with procedurally generated dot plates (original designs, in the
 * spirit of pseudo-isochromatic plates). Figure and background dots have matched CIELAB lightness
 * (means 67.3 and 66.9) with random jitter, so the digit stands out by hue alone. A control plate
 * with a strong lightness difference checks that the screen and the person can do the task at all.
 */

export interface Dot {
  x: number;
  y: number;
  r: number;
  color: string;
}

export type PlateKind = 'control' | 'redGreen';

export interface Plate {
  kind: PlateKind;
  digit: number;
  options: number[];
  seed: number;
}

/** Olive and yellow-green background; L* 61-73. */
export const BACKGROUND = ['#9aa75a', '#a9b066', '#8c9a52', '#b4b874', '#98a861', '#a3a35c'];
/** Orange-pink figure; L* 63-72, the same range as the background. */
export const FIGURE = ['#e0946a', '#d88a66', '#e8a070', '#d28462', '#e39a78', '#dc8f62'];
/** Control figure: dark blue-grey, clearly darker than the background for everyone. */
export const CONTROL = ['#5a6b8c', '#4f5f80', '#62739a'];

/** Deterministic PRNG so a plate looks the same on every render. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Packs non-overlapping dots into a circle of radius `size/2` and colours each by whether its
 * centre falls inside the digit (`inside(x, y)` in plate coordinates).
 */
export function makeDots(plate: Plate, size: number, inside: (x: number, y: number) => boolean, attempts = 6000): Dot[] {
  const rand = mulberry32(plate.seed);
  const R = size / 2;
  const dots: Dot[] = [];
  const figure = plate.kind === 'control' ? CONTROL : FIGURE;
  for (let i = 0; i < attempts; i++) {
    const r = size * (0.008 + rand() * 0.02);
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * (R - r - 1);
    const x = R + Math.cos(angle) * dist;
    const y = R + Math.sin(angle) * dist;
    if (dots.some((d) => (d.x - x) ** 2 + (d.y - y) ** 2 < (d.r + r + 1) ** 2)) continue;
    const palette = inside(x, y) ? figure : BACKGROUND;
    dots.push({ x, y, r, color: palette[Math.floor(rand() * palette.length)]! });
  }
  return dots;
}

/** One control plate first, then five red-green plates, each with four answer choices. */
export function makePlates(rand: () => number = Math.random): Plate[] {
  const digits = [2, 3, 5, 6, 7, 8, 9];
  const shuffled = [...digits].sort(() => rand() - 0.5);
  return shuffled.slice(0, 6).map((digit, i) => {
    const others = digits.filter((d) => d !== digit).sort(() => rand() - 0.5).slice(0, 3);
    return {
      kind: i === 0 ? 'control' : 'redGreen',
      digit,
      options: [digit, ...others].sort((a, b) => a - b),
      seed: Math.floor(rand() * 2 ** 31),
    };
  });
}

export interface ColourResult {
  correct: number;
  total: number;
  controlCorrect: boolean;
  /** true: possible red-green difference; null: invalid because the control plate was missed. */
  flag: boolean | null;
}

/**
 * Two or more misses among the five red-green plates suggests a red-green colour vision difference,
 * but only if the control plate was read; otherwise the screen or task failed and the result is void.
 */
export function scoreColour(plates: Plate[], answers: (number | null)[]): ColourResult {
  const control = plates.findIndex((p) => p.kind === 'control');
  const controlCorrect = control >= 0 && answers[control] === plates[control]!.digit;
  const tests = plates.map((p, i) => ({ p, a: answers[i] })).filter(({ p }) => p.kind === 'redGreen');
  const correct = tests.filter(({ p, a }) => a === p.digit).length;
  return { correct, total: tests.length, controlCorrect, flag: controlCorrect ? tests.length - correct >= 2 : null };
}
