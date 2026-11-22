/** Small DSP toolkit used by the rPPG pipeline. Pure functions, no DOM, unit-tested. */

export function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]!;
  return x.length ? s / x.length : 0;
}

export function std(x: ArrayLike<number>): number {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i]! - m) ** 2;
  return x.length ? Math.sqrt(s / x.length) : 0;
}

/** Linear-interpolates irregular samples (t in seconds) onto a uniform grid at `fs` Hz. */
export function resample(t: number[], y: number[], fs: number): Float64Array {
  if (t.length < 2) return new Float64Array(0);
  const t0 = t[0]!;
  const n = Math.floor((t[t.length - 1]! - t0) * fs) + 1;
  const out = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const ti = t0 + i / fs;
    while (j < t.length - 2 && t[j + 1]! < ti) j++;
    const span = t[j + 1]! - t[j]!;
    const a = span > 0 ? (ti - t[j]!) / span : 0;
    out[i] = y[j]! + (y[j + 1]! - y[j]!) * Math.min(1, Math.max(0, a));
  }
  return out;
}

/** Removes slow trends with a centred moving average of `win` samples. */
export function detrend(x: Float64Array, win: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  const half = Math.max(1, Math.floor(win / 2));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + x[i]!;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    out[i] = x[i]! - (prefix[b]! - prefix[a]!) / (b - a);
  }
  return out;
}

export function nextPow2(n: number): number {
  return 1 << Math.ceil(Math.log2(Math.max(2, n)));
}

/** In-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Hann-windowed, zero-padded power spectrum. Returns power per bin and bin width in Hz. */
export function powerSpectrum(x: Float64Array, fs: number, minBins = 2048): { power: Float64Array; df: number } {
  const n = nextPow2(Math.max(x.length, minBins));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const m = mean(x);
  for (let i = 0; i < x.length; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1));
    re[i] = (x[i]! - m) * w;
  }
  fft(re, im);
  const power = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) power[i] = re[i]! ** 2 + im[i]! ** 2;
  return { power, df: fs / n };
}

/** Zero-phase band-pass by masking the spectrum outside [lo, hi] Hz. */
export function bandpass(x: Float64Array, fs: number, lo: number, hi: number): Float64Array {
  const n = nextPow2(x.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  for (let k = 0; k < n; k++) {
    const f = (Math.min(k, n - k) * fs) / n;
    if (f < lo || f > hi) {
      re[k] = 0;
      im[k] = 0;
    }
  }
  // Inverse FFT via conjugation.
  for (let k = 0; k < n; k++) im[k] = -im[k]!;
  fft(re, im);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = re[i]! / n;
  return out;
}
