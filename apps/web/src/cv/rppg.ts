import { bandpass, detrend, mean, powerSpectrum, resample, std } from './dsp';

/**
 * Remote photoplethysmography with the POS method (Wang, den Brinker, Stuijk, de Haan,
 * "Algorithmic Principles of Remote PPG", IEEE TBME 2017). Input is the per-frame mean RGB of
 * skin pixels (forehead + cheeks); output is heart rate with a signal-quality score.
 */

export interface RgbSample {
  t: number; // seconds
  r: number;
  g: number;
  b: number;
}

export const FS = 30; // resampling rate, Hz
export const HR_BAND: [number, number] = [0.7, 3.0]; // 42–180 bpm
export const RR_BAND: [number, number] = [0.1, 0.5]; // 6–30 breaths/min

/** POS pulse signal from uniformly sampled RGB traces, with overlap-add over ~1.6 s windows. */
export function pos(r: Float64Array, g: Float64Array, b: Float64Array, fs = FS): Float64Array {
  const n = r.length;
  const l = Math.max(2, Math.round(1.6 * fs));
  const h = new Float64Array(n);
  for (let start = 0; start + l <= n; start++) {
    const end = start + l;
    const mr = mean(r.subarray(start, end));
    const mg = mean(g.subarray(start, end));
    const mb = mean(b.subarray(start, end));
    if (mr <= 0 || mg <= 0 || mb <= 0) continue;
    const s1 = new Float64Array(l);
    const s2 = new Float64Array(l);
    for (let i = 0; i < l; i++) {
      const cr = r[start + i]! / mr;
      const cg = g[start + i]! / mg;
      const cb = b[start + i]! / mb;
      s1[i] = cg - cb;
      s2[i] = cg + cb - 2 * cr;
    }
    const sd2 = std(s2);
    const alpha = sd2 > 1e-12 ? std(s1) / sd2 : 0;
    const hw = new Float64Array(l);
    for (let i = 0; i < l; i++) hw[i] = s1[i]! + alpha * s2[i]!;
    const mh = mean(hw);
    for (let i = 0; i < l; i++) h[start + i] = h[start + i]! + (hw[i]! - mh);
  }
  return h;
}

export interface SpectralPeak {
  freq: number; // Hz
  snrDb: number;
}

/**
 * Finds the dominant frequency inside `band` with parabolic interpolation. SNR follows de Haan &
 * Jeanne (2013): energy within ±0.1 Hz of the peak and its first harmonic vs the rest of the band.
 */
export function spectralPeak(x: Float64Array, fs: number, band: [number, number]): SpectralPeak | null {
  if (x.length < fs * 4) return null;
  const { power, df } = powerSpectrum(x, fs);
  const lo = Math.ceil(band[0] / df);
  const hi = Math.min(power.length - 2, Math.floor(band[1] / df));
  let k = lo;
  for (let i = lo; i <= hi; i++) if (power[i]! > power[k]!) k = i;
  if (power[k]! <= 0) return null;

  const logPower = (i: number) => Math.log(Math.max(power[i]!, Number.MIN_VALUE));
  const a = logPower(k - 1);
  const c = logPower(k + 1);
  const denom = a - 2 * logPower(k) + c;
  const offset = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const freq = (k + Math.max(-0.5, Math.min(0.5, offset))) * df;

  const near = (f: number, target: number) => Math.abs(f - target) <= 0.1;
  let signal = 0;
  let noise = 0;
  const bandHi = Math.min(power.length - 1, Math.floor(band[1] / df));
  for (let i = lo; i <= bandHi; i++) {
    const f = i * df;
    if (near(f, freq) || near(f, 2 * freq)) signal += power[i]!;
    else noise += power[i]!;
  }
  const snrDb = noise > 0 ? 10 * Math.log10(signal / noise) : 30;
  return { freq, snrDb };
}

export interface RppgResult {
  heartRate: number | null; // bpm
  breathingRate: number | null; // breaths/min, experimental
  snrDb: number;
  quality: number; // 0..1
  pulse: Float64Array; // filtered pulse waveform for display
}

/** Maps SNR (dB) to a 0..1 quality score. Zero dB is the acceptance threshold. */
export function qualityFromSnr(snrDb: number): number {
  return Math.max(0, Math.min(1, (snrDb + 6) / 12));
}

function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = fraction * (sorted.length - 1);
  const lower = Math.floor(index);
  return sorted[lower]! + (sorted[Math.ceil(index)]! - sorted[lower]!) * (index - lower);
}

const WINDOW_SECONDS = 10;
const MAX_GAP = 0.25;

export function estimate(
  samples: RgbSample[],
  { motion = 0, rejectedTimes = [] }: { motion?: number; rejectedTimes?: number[] } = {},
): RppgResult {
  const empty: RppgResult = { heartRate: null, breathingRate: null, snrDb: -Infinity, quality: 0, pulse: new Float64Array(0) };
  const unique = samples.filter((sample, i) => i === 0 || sample.t > samples[i - 1]!.t);
  const start = Math.min(unique[0]?.t ?? Infinity, rejectedTimes[0] ?? Infinity);
  const end = Math.max(unique.at(-1)?.t ?? -Infinity, rejectedTimes.at(-1) ?? -Infinity);
  if (end - start < WINDOW_SECONDS) return empty;

  const rates: number[] = [];
  const snrs: number[] = [];
  let total = 0;
  let pulse: RppgResult['pulse'] = empty.pulse;
  for (let windowEnd = end; windowEnd - WINDOW_SECONDS >= start; windowEnd--) {
    total++;
    const windowStart = windowEnd - WINDOW_SECONDS;
    const trace = unique.filter(({ t }) => t >= windowStart && t <= windowEnd);
    const rejected = rejectedTimes.filter((t) => t >= windowStart && t <= windowEnd).length;
    if (trace.length < 12 * WINDOW_SECONDS || rejected > (trace.length + rejected) / 5) continue;
    if (trace[0]!.t - windowStart > MAX_GAP || windowEnd - trace.at(-1)!.t > MAX_GAP) continue;
    if (trace.some(({ t }, i) => i > 0 && t - trace[i - 1]!.t > MAX_GAP)) continue;

    const times = trace.map(({ t }) => t);
    const r = resample(times, trace.map(({ r }) => r), FS);
    const g = resample(times, trace.map(({ g }) => g), FS);
    const b = resample(times, trace.map(({ b }) => b), FS);
    const windowPulse = bandpass(detrend(pos(r, g, b, FS), FS), FS, HR_BAND[0], HR_BAND[1]);
    const peak = spectralPeak(windowPulse, FS, HR_BAND);
    if (!pulse.length) pulse = windowPulse;
    if (!peak || peak.snrDb < 0) continue;
    rates.push(peak.freq * 60);
    snrs.push(peak.snrDb);
  }
  if (!rates.length) return { ...empty, pulse };
  const snrDb = quantile(snrs, 0.5);
  const quality = qualityFromSnr(snrDb) * Math.max(0, 1 - motion);
  const consistent = rates.length >= total / 2 && quantile(rates, 0.75) - quantile(rates, 0.25) <= 6;
  return {
    heartRate: consistent && quality >= 0.5 ? quantile(rates, 0.5) : null,
    breathingRate: null,
    snrDb,
    quality: consistent ? quality : 0,
    pulse,
  };
}
