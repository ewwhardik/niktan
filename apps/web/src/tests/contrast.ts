/**
 * Contrast sensitivity, Pelli-Robson style: a large tumbling E whose contrast falls in 0.15 log
 * steps. Each level shows up to three letters; two right moves on, two wrong ends the test. The
 * score is the last level passed, as log contrast sensitivity (logCS).
 */
import type { Direction } from './vision';

/** logCS levels; contrast = 10^-logCS. The 8-bit screen floor is near logCS 2.1. */
export const LEVELS = [0.6, 0.9, 1.05, 1.2, 1.35, 1.5, 1.65, 1.8, 1.95];
/** Adults normally score 1.65 or better; below 1.5 is reduced and worth an eye check. */
export const REDUCED_BELOW = 1.5;
export const PER_LEVEL = 3;
export const PASS_AT = 2;

export interface ContrastState {
  level: number;
  shown: number;
  correct: number;
  passed: number | null;
  done: boolean;
  current: Direction;
}

const DIRS: Direction[] = ['up', 'right', 'down', 'left'];
const pick = (rand: () => number, not?: Direction) => {
  const options = DIRS.filter((d) => d !== not);
  return options[Math.floor(rand() * options.length)]!;
};

export function startContrast(rand: () => number = Math.random): ContrastState {
  return { level: 0, shown: 0, correct: 0, passed: null, done: false, current: pick(rand) };
}

export function answerContrast(s: ContrastState, dir: Direction | 'unsure', rand: () => number = Math.random): ContrastState {
  if (s.done) return s;
  const shown = s.shown + 1;
  const correct = s.correct + (dir === s.current ? 1 : 0);
  if (correct >= PASS_AT) {
    const passed = LEVELS[s.level]!;
    if (s.level + 1 >= LEVELS.length) return { ...s, shown, correct, passed, done: true };
    return { level: s.level + 1, shown: 0, correct: 0, passed, done: false, current: pick(rand, s.current) };
  }
  if (shown - correct > PER_LEVEL - PASS_AT) return { ...s, shown, correct, done: true };
  return { ...s, shown, correct, current: pick(rand, s.current) };
}

/** logCS result; a failed first level is scored 0.3 (worse than the chart's first line). */
export function contrastScore(s: ContrastState): number {
  return s.passed ?? 0.3;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/**
 * An 8-bit screen near white can only step contrast by about 0.9 %, a whole chart line at the
 * levels that matter. Instead the letter mixes two adjacent grey levels pixel by pixel: `frac` of
 * the pixels use `hi`, the rest `lo`, so the average luminance gives exactly 10^-logCS contrast.
 */
export function ditherFor(logCs: number): { lo: number; hi: number; frac: number } {
  const target = 1 - 10 ** -logCs;
  const exact = 255 * toSrgb(target);
  const lo = Math.max(0, Math.min(254, Math.floor(exact)));
  const hi = lo + 1;
  const a = toLinear(lo / 255);
  const b = toLinear(hi / 255);
  return { lo, hi, frac: Math.max(0, Math.min(1, (target - a) / (b - a))) };
}

/** Weber contrast of a dithered letter against white, for honest reporting and tests. */
export function shownContrast({ lo, hi, frac }: { lo: number; hi: number; frac: number }): number {
  return 1 - ((1 - frac) * toLinear(lo / 255) + frac * toLinear(hi / 255));
}

/** 4×4 Bayer thresholds: spreads the `hi` pixels evenly, with no visible pattern at reading distance. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
