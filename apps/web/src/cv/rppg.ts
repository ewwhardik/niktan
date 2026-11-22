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

  const a = power[k - 1] ?? power[k]!;
  const c = power[k + 1] ?? power[k]!;
  const denom = a - 2 * power[k]! + c;
  const offset = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const freq = (k + Math.max(-0.5, Math.min(0.5, offset))) * df;

  const near = (f: number, target: number) => Math.abs(f - target) <= 0.1;
  let signal = 0;
  let noise = 0;
  const bandHi = Math.min(power.length - 1, Math.floor(Math.max(band[1], 2 * freq + 0.2) / df));
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

/** Maps SNR (dB) to a 0..1 quality score. Below ~-3 dB the peak is not trustworthy. */
export function qualityFromSnr(snrDb: number): number {
  return Math.max(0, Math.min(1, (snrDb + 6) / 12));
}

export function estimate(samples: RgbSample[], opts: { motion?: number } = {}): RppgResult {
  const empty: RppgResult = { heartRate: null, breathingRate: null, snrDb: -Infinity, quality: 0, pulse: new Float64Array(0) };
  if (samples.length < FS * 5) return empty;
  const t = samples.map((s) => s.t);
  const r = resample(t, samples.map((s) => s.r), FS);
  const g = resample(t, samples.map((s) => s.g), FS);
  const b = resample(t, samples.map((s) => s.b), FS);
  const raw = pos(r, g, b, FS);
  const pulse = bandpass(detrend(raw, FS), FS, HR_BAND[0], HR_BAND[1]);
  const peak = spectralPeak(pulse, FS, HR_BAND);
  if (!peak) return { ...empty, pulse };

  // Breathing modulates the green-channel baseline; experimental and shown as such.
  const resp = bandpass(detrend(g, FS * 10), FS, RR_BAND[0], RR_BAND[1]);
  const rPeak = samples.length / FS >= 20 ? spectralPeak(resp, FS, RR_BAND) : null;

  // Large head motion corrupts the skin signal; scale quality down rather than hiding the number.
  const motionPenalty = opts.motion ? Math.max(0, 1 - opts.motion) : 1;
  const quality = qualityFromSnr(peak.snrDb) * motionPenalty;
  return {
    heartRate: peak.freq * 60,
    breathingRate: rPeak && rPeak.snrDb > 0 ? rPeak.freq * 60 : null,
    snrDb: peak.snrDb,
    quality,
    pulse,
  };
}
