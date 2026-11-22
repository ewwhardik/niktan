/**
 * Digits-in-noise hearing screen (as used by WHO hearWHO): digit triplets in speech-shaped noise,
 * one-up one-down adaptive SNR. Speech reception threshold (SRT) = mean SNR of the later triplets.
 */

export const DIN = {
  triplets: 23,
  startSnr: 0,
  step: 2,
  minSnr: -20,
  maxSnr: 10,
  /** SRT averages the SNRs presented from triplet 5 onward (and the SNR the 24th would get). */
  discard: 4,
  /** Screening cut-off in dB SNR; above it = refer. Calibrate on local data before trusting. */
  referAbove: -9.5,
} as const;

export interface DinState {
  index: number;
  snr: number;
  history: { digits: string; response: string; snr: number; correct: boolean }[];
  current: string;
  done: boolean;
}

export function randomTriplet(rand: () => number = Math.random, avoid?: string): string {
  for (;;) {
    // No repeated digit in a triplet, and never the same triplet twice in a row.
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const digits: number[] = [];
    while (digits.length < 3) digits.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
    const t = digits.join('');
    if (t !== avoid) return t;
  }
}

export function startDin(rand: () => number = Math.random): DinState {
  return { index: 0, snr: DIN.startSnr, history: [], current: randomTriplet(rand), done: false };
}

export function respond(state: DinState, response: string, rand: () => number = Math.random): DinState {
  if (state.done) return state;
  const correct = response === state.current;
  const history = [...state.history, { digits: state.current, response, snr: state.snr, correct }];
  const nextSnr = Math.max(DIN.minSnr, Math.min(DIN.maxSnr, state.snr + (correct ? -DIN.step : DIN.step)));
  const index = state.index + 1;
  return { index, snr: nextSnr, history, current: randomTriplet(rand, state.current), done: index >= DIN.triplets };
}

export function srt(state: DinState): number | null {
  if (!state.done) return null;
  const snrs = [...state.history.slice(DIN.discard).map((h) => h.snr), state.snr];
  return Math.round((snrs.reduce((a, b) => a + b, 0) / snrs.length) * 10) / 10;
}

export function dinResult(state: DinState): { srtDb: number; result: 'pass' | 'refer' } | null {
  const value = srt(state);
  if (value === null) return null;
  return { srtDb: value, result: value > DIN.referAbove ? 'refer' : 'pass' };
}

/** Gain (linear) to apply to the speech so that speech/noise RMS ratio equals `snrDb`. */
export function speechGainForSnr(snrDb: number, speechRms: number, noiseRms: number): number {
  return (noiseRms / speechRms) * 10 ** (snrDb / 20);
}
