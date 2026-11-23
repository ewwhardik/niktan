import { bandpass, detrend, powerSpectrum, resample, std, mean } from './dsp';
import { FS, HR_BAND, pos, qualityFromSnr, type RppgResult } from './rppg';

/**
 * rPPG v2: multi-region, multi-algorithm fusion with temporal tracking.
 *
 * 1. Forehead, left cheek and right cheek are processed separately, because a shadow or a hand on
 *    one region should not corrupt the others.
 * 2. Sudden steps in each colour trace (a head jerk, a light switching) are clipped before any
 *    pulse extraction, so one bad frame does not smear energy across the whole spectrum.
 * 3. Each region gives three pulse estimates: POS (Wang et al. 2017), CHROM (de Haan & Jeanne 2013)
 *    and an OMIT-style orthogonal projection (Casado & López 2023).
 * 4. The normalised power spectra are averaged with weights from each signal's own SNR, so clean
 *    regions and methods dominate.
 * 5. A harmonic-sum spectrum favours the true fundamental over its 2x harmonic.
 * 6. Across windows, a small Viterbi search picks the heart-rate path that balances spectral power
 *    against implausible jumps between neighbouring windows.
 * 7. Beats are located in the time domain around the tracked rate, so the interface can pulse in
 *    phase with the person's own heartbeat rather than with a generic loop.
 */

export type RoiName = 'forehead' | 'leftCheek' | 'rightCheek';
export const ROI_NAMES: RoiName[] = ['forehead', 'leftCheek', 'rightCheek'];

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** Skin pixels averaged; 0 means the region was not visible in this frame. */
  n: number;
}

export interface MultiSample {
  t: number;
  rois: Partial<Record<RoiName, Rgb>>;
}

/** CHROM pulse from uniformly sampled RGB traces, with overlap-add over ~1.6 s windows. */
export function chrom(r: Float64Array, g: Float64Array, b: Float64Array, fs = FS): Float64Array {
  const n = r.length;
  const l = Math.max(2, Math.round(1.6 * fs));
  const h = new Float64Array(n);
  const win = new Float64Array(l);
  for (let i = 0; i < l; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (l - 1));
  for (let start = 0; start + l <= n; start += Math.max(1, Math.floor(l / 2))) {
    const mr = mean(r.subarray(start, start + l));
    const mg = mean(g.subarray(start, start + l));
    const mb = mean(b.subarray(start, start + l));
    if (mr <= 0 || mg <= 0 || mb <= 0) continue;
    const x = new Float64Array(l);
    const y = new Float64Array(l);
    for (let i = 0; i < l; i++) {
      const rn = r[start + i]! / mr;
      const gn = g[start + i]! / mg;
      const bn = b[start + i]! / mb;
      x[i] = 3 * rn - 2 * gn;
      y[i] = 1.5 * rn + gn - 1.5 * bn;
    }
    const sy = std(y);
    const alpha = sy > 1e-12 ? std(x) / sy : 0;
    const mx = mean(x);
    const my = mean(y);
    for (let i = 0; i < l; i++) h[start + i] = h[start + i]! + win[i]! * (x[i]! - mx - alpha * (y[i]! - my));
  }
  return h;
}

/**
 * OMIT-style pulse: removes the window's mean skin-colour direction (intensity and specular change)
 * by orthogonal projection and keeps the green row of what remains. The original method takes that
 * direction from a QR factorisation; the window mean is the same direction with less frame noise.
 */
export function omit(r: Float64Array, g: Float64Array, b: Float64Array, fs = FS): Float64Array {
  const n = r.length;
  const l = Math.max(2, Math.round(1.6 * fs));
  const h = new Float64Array(n);
  const win = new Float64Array(l);
  for (let i = 0; i < l; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (l - 1));
  for (let start = 0; start + l <= n; start += Math.max(1, Math.floor(l / 2))) {
    const mr = mean(r.subarray(start, start + l));
    const mg = mean(g.subarray(start, start + l));
    const mb = mean(b.subarray(start, start + l));
    if (mr <= 0 || mg <= 0 || mb <= 0) continue;
    // After mean normalisation every channel averages 1, so the skin direction is (1,1,1)/√3.
    const y = new Float64Array(l);
    for (let i = 0; i < l; i++) {
      const rn = r[start + i]! / mr;
      const gn = g[start + i]! / mg;
      const bn = b[start + i]! / mb;
      y[i] = gn - (rn + gn + bn) / 3;
    }
    const my = mean(y);
    for (let i = 0; i < l; i++) h[start + i] = h[start + i]! + win[i]! * (y[i]! - my);
  }
  return h;
}

/**
 * Clips first differences larger than `k` robust standard deviations and re-integrates. A step in
 * brightness becomes a flat shift (removed later by detrending) instead of a broadband spike.
 */
export function despike(x: Float64Array, k = 4): Float64Array {
  const n = x.length;
  if (n < 3) return x.slice();
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = x[i + 1]! - x[i]!;
  const med = median(Array.from(d));
  const mad = 1.4826 * median(Array.from(d, (v) => Math.abs(v - med)));
  if (!(mad > 0)) return x.slice();
  const lo = med - k * mad;
  const hi = med + k * mad;
  const out = new Float64Array(n);
  out[0] = x[0]!;
  for (let i = 0; i < n - 1; i++) out[i + 1] = out[i]! + Math.min(hi, Math.max(lo, d[i]!));
  return out;
}

interface Spectrum {
  power: Float64Array;
  df: number;
}

/** In-band spectrum of a pulse signal, normalised to unit total in-band power. */
function bandSpectrum(pulse: Float64Array): Spectrum | null {
  const { power, df } = powerSpectrum(pulse, FS, 2048);
  const lo = Math.ceil(HR_BAND[0] / df);
  const hi = Math.floor(HR_BAND[1] / df);
  let total = 0;
  for (let i = lo; i <= hi; i++) total += power[i]!;
  if (!(total > 0)) return null;
  const out = new Float64Array(power.length);
  for (let i = lo; i <= hi; i++) out[i] = power[i]! / total;
  return { power: out, df };
}

/** Share of in-band power within ±0.1 Hz of the peak and its harmonic, as SNR in dB. */
function snrOf(spec: Spectrum, freq: number): number {
  const lo = Math.ceil(HR_BAND[0] / spec.df);
  const hi = Math.floor(HR_BAND[1] / spec.df);
  let signal = 0;
  let noise = 0;
  for (let i = lo; i <= hi; i++) {
    const f = i * spec.df;
    if (Math.abs(f - freq) <= 0.1 || Math.abs(f - 2 * freq) <= 0.1) signal += spec.power[i]!;
    else noise += spec.power[i]!;
  }
  return noise > 0 ? 10 * Math.log10(signal / noise) : 30;
}

function argmaxBand(power: Float64Array, df: number): number {
  const lo = Math.ceil(HR_BAND[0] / df);
  const hi = Math.floor(HR_BAND[1] / df);
  let k = lo;
  for (let i = lo; i <= hi; i++) if (power[i]! > power[k]!) k = i;
  return k;
}

/** Up to `count` local maxima in the band, strongest first, with parabolic refinement. */
function topPeaks(power: Float64Array, df: number, count: number): { freq: number; power: number }[] {
  const lo = Math.ceil(HR_BAND[0] / df);
  const hi = Math.floor(HR_BAND[1] / df);
  const peaks: { freq: number; power: number }[] = [];
  for (let i = lo + 1; i < hi; i++) {
    const p = power[i]!;
    if (p > power[i - 1]! && p >= power[i + 1]!) {
      const a = power[i - 1]!;
      const c = power[i + 1]!;
      const den = a - 2 * p + c;
      const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
      peaks.push({ freq: (i + off) * df, power: p });
    }
  }
  return peaks.sort((x, y) => y.power - x.power).slice(0, count);
}

export interface WindowEstimate {
  /** Candidate rates (bpm) with fused spectral weight. */
  candidates: { bpm: number; weight: number }[];
  snrDb: number;
  pulse: Float64Array;
  /** Time (s) of the first pulse sample, on the same clock as the input samples. */
  t0?: number;
}

/** One window: per-region POS + CHROM, SNR-weighted spectral fusion, harmonic-sum peak picking. */
export function fuseWindow(window: MultiSample[]): WindowEstimate | null {
  const times = window.map((s) => s.t);
  const spectra: { spec: Spectrum; weight: number; pulse: Float64Array; t0: number }[] = [];
  for (const roi of ROI_NAMES) {
    const present = window.filter((s) => (s.rois[roi]?.n ?? 0) > 0);
    // A region hidden for more than a fifth of the window is left out of this window.
    if (present.length < window.length * 0.8 || present.length < MIN_FPS * 4) continue;
    const t = present.map((s) => s.t);
    const r = despike(resample(t, present.map((s) => s.rois[roi]!.r), FS));
    const g = despike(resample(t, present.map((s) => s.rois[roi]!.g), FS));
    const b = despike(resample(t, present.map((s) => s.rois[roi]!.b), FS));
    for (const method of [pos, chrom, omit]) {
      const pulse = bandpass(detrend(method(r, g, b, FS), FS), FS, HR_BAND[0], HR_BAND[1]);
      const spec = bandSpectrum(pulse);
      if (!spec) continue;
      const k = argmaxBand(spec.power, spec.df);
      const snr = snrOf(spec, k * spec.df);
      // Linear SNR weight; signals below -3 dB contribute nothing.
      const weight = Math.max(0, 10 ** (snr / 10) - 0.5);
      if (weight > 0) spectra.push({ spec, weight, pulse, t0: t[0]! });
    }
  }
  if (!spectra.length || times.length < 2) return null;

  const df = spectra[0]!.spec.df;
  const fused = new Float64Array(spectra[0]!.spec.power.length);
  let wsum = 0;
  for (const { spec, weight } of spectra) {
    for (let i = 0; i < fused.length; i++) fused[i] = fused[i]! + weight * spec.power[i]!;
    wsum += weight;
  }
  for (let i = 0; i < fused.length; i++) fused[i] = fused[i]! / wsum;

  // Harmonic sum: a true pulse at f also has energy at 2f; a harmonic at 2f has little at 4f.
  const hs = new Float64Array(fused.length);
  for (let i = 0; i < fused.length; i++) hs[i] = fused[i]! + 0.5 * (fused[2 * i] ?? 0);

  const peaks = topPeaks(hs, df, 3);
  if (!peaks.length) return null;
  const best = spectra.reduce((a, b) => (b.weight > a.weight ? b : a));
  const snrDb = snrOf({ power: fused, df }, peaks[0]!.freq);
  return { candidates: peaks.map((p) => ({ bpm: p.freq * 60, weight: p.power })), snrDb, pulse: best.pulse, t0: best.t0 };
}

/**
 * Viterbi over windows: each window offers up to three candidate rates. The path cost rewards
 * spectral weight and penalises jumps larger than physiology allows between windows 1 s apart.
 */
export function trackRates(windows: WindowEstimate[], jumpPenalty = 0.08): number[] {
  if (!windows.length) return [];
  const cost: number[][] = [];
  const back: number[][] = [];
  windows.forEach((w, wi) => {
    cost[wi] = [];
    back[wi] = [];
    w.candidates.forEach((c, ci) => {
      const emit = -Math.log(Math.max(c.weight, 1e-9));
      if (wi === 0) {
        cost[wi]![ci] = emit;
        back[wi]![ci] = -1;
        return;
      }
      let bestCost = Infinity;
      let bestPrev = 0;
      windows[wi - 1]!.candidates.forEach((p, pi) => {
        const jump = Math.max(0, Math.abs(c.bpm - p.bpm) - 3);
        const total = cost[wi - 1]![pi]! + jumpPenalty * jump;
        if (total < bestCost) {
          bestCost = total;
          bestPrev = pi;
        }
      });
      cost[wi]![ci] = bestCost + emit;
      back[wi]![ci] = bestPrev;
    });
  });
  const last = cost.length - 1;
  let ci = cost[last]!.indexOf(Math.min(...cost[last]!));
  const path: number[] = [];
  for (let wi = last; wi >= 0; wi--) {
    path.unshift(windows[wi]!.candidates[ci]!.bpm);
    ci = back[wi]![ci]!;
  }
  return path;
}

const WINDOW_SECONDS = 10;
const STEP_SECONDS = 1;
/**
 * Phones running the face model on the CPU often process only 6-10 frames a second and stall now
 * and then. Samples are resampled to 30 Hz, so 6 per second still cover heart rates up to 180 bpm;
 * a window is kept unless it has a long hole or too much of it is missing.
 */
export const MIN_FPS = 6;
const MAX_GAP = 0.6;
const MAX_MISSING = 0.2;

/** True when the window's samples are dense enough to resample faithfully. */
export function windowUsable(times: number[], start: number, end: number): boolean {
  if (times.length < MIN_FPS * (end - start)) return false;
  if (times[0]! - start > MAX_GAP || end - times.at(-1)! > MAX_GAP) return false;
  let missing = Math.max(0, times[0]! - start - 0.2) + Math.max(0, end - times.at(-1)! - 0.2);
  for (let i = 1; i < times.length; i++) {
    const gap = times[i]! - times[i - 1]!;
    if (gap > MAX_GAP) return false;
    if (gap > 0.2) missing += gap - 0.2;
  }
  return missing <= MAX_MISSING * (end - start);
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Systolic peaks of a pulse trace near the tracked rate. The trace is narrowed to a band around
 * `bpm` so each beat gives one clean maximum, then peaks closer than 60 % of a beat are merged.
 * Returns peak times in seconds from the first sample, refined to sub-sample precision.
 */
export function detectBeats(pulse: Float64Array, fs: number, bpm: number): { times: number[]; wave: Float64Array } {
  const f = bpm / 60;
  if (pulse.length < fs * 2 || !(f > 0)) return { times: [], wave: new Float64Array(0) };
  const wave = bandpass(pulse, fs, Math.max(0.5, f - 0.4), f + 0.6);
  const s = std(wave) || 1;
  for (let i = 0; i < wave.length; i++) wave[i] = wave[i]! / s;
  const half = Math.max(1, Math.floor((0.3 * fs) / f));
  const times: number[] = [];
  for (let i = 1; i < wave.length - 1; i++) {
    const v = wave[i]!;
    if (v <= 0.2 || v < wave[i - 1]! || v < wave[i + 1]!) continue;
    let isMax = true;
    for (let j = Math.max(0, i - half); j <= Math.min(wave.length - 1, i + half); j++) {
      if (wave[j]! > v) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    const a = wave[i - 1]!;
    const c = wave[i + 1]!;
    const den = a - 2 * v + c;
    const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    const t = (i + off) / fs;
    if (!times.length || t - times.at(-1)! > (0.6 * 60) / bpm) times.push(t);
  }
  return { times, wave };
}

export interface MultiResult extends RppgResult {
  /** Beat times on the input clock, from the most recent window. */
  beats: number[];
  /** Narrow-band pulse for display, ending at `waveEnd` on the input clock. */
  wave: Float64Array;
  waveEnd: number;
  /** Tracked rate per 1 s step, for a stability read-out. */
  track: number[];
}

/**
 * Scalar Kalman filter for a live heart-rate read-out. The rate follows a random walk; measurement
 * noise grows as signal quality falls, and readings far from the prediction are ignored until three
 * in a row agree, which then resets the filter onto the new rate.
 */
export class RateFilter {
  private x: number | null = null;
  private p = 0;
  private misses = 0;
  constructor(private readonly processNoise = 6, private readonly gate = 3) {}

  get value(): number | null {
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.p = 0;
    this.misses = 0;
  }

  update(z: number, quality: number, dt = 1): number {
    const q = Math.max(0, Math.min(1, quality));
    const r = 4 + 220 * (1 - q) ** 2;
    if (this.x === null) {
      this.x = z;
      this.p = r;
      return z;
    }
    this.p += this.processNoise * dt;
    const s = this.p + r;
    const innovation = z - this.x;
    if (innovation * innovation > this.gate * this.gate * s) {
      if (++this.misses >= 3) {
        this.x = z;
        this.p = r;
        this.misses = 0;
      }
      return this.x;
    }
    this.misses = 0;
    const k = this.p / s;
    this.x += k * innovation;
    this.p *= 1 - k;
    return this.x;
  }
}

/** Full estimate over a scan, in the same result shape as v1 so the UI can use either. */
export function estimateMulti(
  samples: MultiSample[],
  { motion = 0, rejectedTimes = [] }: { motion?: number; rejectedTimes?: number[] } = {},
): MultiResult {
  const empty: MultiResult = { heartRate: null, breathingRate: null, snrDb: -Infinity, quality: 0, pulse: new Float64Array(0), beats: [], wave: new Float64Array(0), waveEnd: 0, track: [] };
  const unique = samples.filter((s, i) => i === 0 || s.t > samples[i - 1]!.t);
  if (unique.length < 2) return empty;
  const start = Math.min(unique[0]!.t, rejectedTimes[0] ?? Infinity);
  const end = Math.max(unique.at(-1)!.t, rejectedTimes.at(-1) ?? -Infinity);
  if (end - start < WINDOW_SECONDS) return empty;

  const windows: WindowEstimate[] = [];
  let total = 0;
  for (let ws = start; ws + WINDOW_SECONDS <= end + 1e-9; ws += STEP_SECONDS) {
    total++;
    const we = ws + WINDOW_SECONDS;
    const win = unique.filter((s) => s.t >= ws && s.t <= we);
    const rejected = rejectedTimes.filter((t) => t >= ws && t <= we).length;
    if (!win.length || rejected > win.length / 4 || !windowUsable(win.map((s) => s.t), ws, we)) continue;
    const est = fuseWindow(win);
    if (est && est.snrDb > -3) windows.push(est);
  }
  if (!windows.length) return empty;
  const path = trackRates(windows);
  const snrDb = median(windows.map((w) => w.snrDb));
  const coverage = windows.length / Math.max(1, total);
  const quality = qualityFromSnr(snrDb) * Math.max(0, 1 - motion) * Math.min(1, coverage * 1.5);
  const last = windows.at(-1)!;
  const { times, wave } = detectBeats(last.pulse, FS, path.at(-1)!);
  const t0 = last.t0 ?? 0;
  return {
    heartRate: coverage >= 0.5 && quality >= 0.5 ? median(path) : null,
    breathingRate: null,
    snrDb,
    quality,
    pulse: last.pulse,
    beats: times.map((t) => t0 + t),
    wave,
    waveEnd: t0 + (wave.length - 1) / FS,
    track: path,
  };
}
