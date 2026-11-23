import { bandpass, detrend, powerSpectrum, resample, std, mean } from './dsp';
import { FS, HR_BAND, pos, qualityFromSnr, type RppgResult } from './rppg';

/**
 * rPPG v2: multi-region, multi-algorithm fusion with temporal tracking.
 *
 * 1. Forehead, left cheek and right cheek are processed separately, because a shadow or a hand on
 *    one region should not corrupt the others.
 * 2. Each region gives two pulse estimates: POS (Wang et al. 2017) and CHROM (de Haan & Jeanne 2013).
 * 3. The normalised power spectra are averaged with weights from each signal's own SNR, so clean
 *    regions dominate.
 * 4. A harmonic-sum spectrum favours the true fundamental over its 2x harmonic.
 * 5. Across windows, a small Viterbi search picks the heart-rate path that balances spectral power
 *    against implausible jumps between neighbouring windows.
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
}

/** One window: per-region POS + CHROM, SNR-weighted spectral fusion, harmonic-sum peak picking. */
export function fuseWindow(window: MultiSample[]): WindowEstimate | null {
  const times = window.map((s) => s.t);
  const spectra: { spec: Spectrum; weight: number; pulse: Float64Array }[] = [];
  for (const roi of ROI_NAMES) {
    const present = window.filter((s) => (s.rois[roi]?.n ?? 0) > 0);
    // A region hidden for more than a fifth of the window is left out of this window.
    if (present.length < window.length * 0.8 || present.length < FS * 4) continue;
    const t = present.map((s) => s.t);
    const r = resample(t, present.map((s) => s.rois[roi]!.r), FS);
    const g = resample(t, present.map((s) => s.rois[roi]!.g), FS);
    const b = resample(t, present.map((s) => s.rois[roi]!.b), FS);
    for (const method of [pos, chrom]) {
      const pulse = bandpass(detrend(method(r, g, b, FS), FS), FS, HR_BAND[0], HR_BAND[1]);
      const spec = bandSpectrum(pulse);
      if (!spec) continue;
      const k = argmaxBand(spec.power, spec.df);
      const snr = snrOf(spec, k * spec.df);
      // Linear SNR weight; signals below -3 dB contribute nothing.
      const weight = Math.max(0, 10 ** (snr / 10) - 0.5);
      if (weight > 0) spectra.push({ spec, weight, pulse });
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
  return { candidates: peaks.map((p) => ({ bpm: p.freq * 60, weight: p.power })), snrDb, pulse: best.pulse };
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
const MAX_GAP = 0.25;

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Full estimate over a scan, in the same result shape as v1 so the UI can use either. */
export function estimateMulti(samples: MultiSample[], { motion = 0 }: { motion?: number } = {}): RppgResult {
  const empty: RppgResult = { heartRate: null, breathingRate: null, snrDb: -Infinity, quality: 0, pulse: new Float64Array(0) };
  const unique = samples.filter((s, i) => i === 0 || s.t > samples[i - 1]!.t);
  if (unique.length < 2) return empty;
  const start = unique[0]!.t;
  const end = unique.at(-1)!.t;
  if (end - start < WINDOW_SECONDS) return empty;

  const windows: WindowEstimate[] = [];
  let total = 0;
  for (let ws = start; ws + WINDOW_SECONDS <= end + 1e-9; ws += STEP_SECONDS) {
    total++;
    const win = unique.filter((s) => s.t >= ws && s.t <= ws + WINDOW_SECONDS);
    if (win.length < 12 * WINDOW_SECONDS) continue;
    if (win.some((s, i) => i > 0 && s.t - win[i - 1]!.t > MAX_GAP)) continue;
    const est = fuseWindow(win);
    if (est && est.snrDb > -3) windows.push(est);
  }
  if (!windows.length) return empty;
  const path = trackRates(windows);
  const snrDb = median(windows.map((w) => w.snrDb));
  const coverage = windows.length / Math.max(1, total);
  const quality = qualityFromSnr(snrDb) * Math.max(0, 1 - motion) * Math.min(1, coverage * 1.5);
  return {
    heartRate: quality >= 0.5 ? median(path) : null,
    breathingRate: null,
    snrDb,
    quality,
    pulse: windows.at(-1)!.pulse,
  };
}
