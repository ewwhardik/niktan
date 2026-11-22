/**
 * Tumbling-E visual acuity, Peek-Acuity style. The optotype's full height subtends
 * 5 arcmin × 10^logMAR at the viewing distance.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

export const CARD_WIDTH_MM = 85.6; // ISO/IEC 7810 ID-1 (ATM, Aadhaar PVC card)
const ARCMIN = Math.PI / (180 * 60);

export function optotypeMm(logMar: number, distanceMm: number): number {
  return 2 * distanceMm * Math.tan((5 * ARCMIN * 10 ** logMar) / 2);
}

export function optotypePx(logMar: number, distanceMm: number, pxPerMm: number): number {
  return optotypeMm(logMar, distanceMm) * pxPerMm;
}

/** logMAR → Snellen denominator at 6 m, rounded to the standard chart line. */
export function snellen6(logMar: number): string {
  const lines = [3, 4, 5, 6, 7.5, 9, 12, 15, 18, 24, 36, 60, 120];
  const exact = 6 * 10 ** logMar;
  const nearest = lines.reduce((a, b) => (Math.abs(b - exact) < Math.abs(a - exact) ? b : a));
  return `6/${nearest}`;
}

export interface StaircaseState {
  logMar: number;
  shown: number;
  correct: number;
  lastPassed: number | null;
  done: boolean;
  current: Direction;
}

export const START_LOGMAR = 1.0;
export const MIN_LOGMAR = -0.1;
export const STEP = 0.1;
export const PER_LEVEL = 5;
export const PASS_AT = 3;

export function startStaircase(rand: () => number = Math.random): StaircaseState {
  return { logMar: START_LOGMAR, shown: 0, correct: 0, lastPassed: null, done: false, current: pick(rand) };
}

function pick(rand: () => number, not?: Direction): Direction {
  const options = DIRECTIONS.filter((d) => d !== not);
  return options[Math.floor(rand() * options.length)]!;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Records one answer. A level passes as soon as 3 of 5 are right and fails as soon as passing is
 * impossible, which keeps the test short. Result = smallest level passed (null = could not read 1.0).
 */
export function answer(state: StaircaseState, dir: Direction | 'unsure', rand: () => number = Math.random): StaircaseState {
  if (state.done) return state;
  const shown = state.shown + 1;
  const correct = state.correct + (dir === state.current ? 1 : 0);
  const wrong = shown - correct;
  if (correct >= PASS_AT) {
    const next = round1(state.logMar - STEP);
    if (next < MIN_LOGMAR) return { ...state, shown, correct, lastPassed: state.logMar, done: true };
    return { logMar: next, shown: 0, correct: 0, lastPassed: state.logMar, done: false, current: pick(rand, state.current) };
  }
  if (wrong > PER_LEVEL - PASS_AT) return { ...state, shown, correct, done: true };
  return { ...state, shown, correct, current: pick(rand, state.current) };
}

/** Result logMAR for an eye; a failed first level is recorded as 1.1 (worse than 6/60). */
export function resultLogMar(state: StaircaseState): number {
  return state.lastPassed ?? 1.1;
}

/** Viewing distance from the iris: visible iris diameter is ~11.7 mm across adults. */
export const IRIS_MM = 11.7;
export function distanceFromIris(irisPx: number, focalPx: number): number {
  return (focalPx * IRIS_MM) / irisPx;
}
