import { describe, expect, it } from 'vitest';
import { bandpass, fft, resample } from '../src/cv/dsp';
import { estimate, FS, spectralPeak, type RgbSample } from '../src/cv/rppg';

/** Synthetic skin trace: pulse modulates mostly green (as blood absorption does), plus noise and jitter. */
function synthetic(bpm: number, seconds: number, noise = 0.15, seed = 1): RgbSample[] {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  };
  const out: RgbSample[] = [];
  let t = 0;
  while (t < seconds) {
    const p = Math.sin(2 * Math.PI * (bpm / 60) * t);
    const drift = 3 * Math.sin(2 * Math.PI * 0.05 * t);
    out.push({ t, r: 150 + drift + 0.3 * p + noise * rand(), g: 110 + drift + 0.8 * p + noise * rand(), b: 90 + drift + 0.2 * p + noise * rand() });
    t += 1 / 30 + 0.004 * rand(); // irregular frame times like a real camera
  }
  return out;
}

describe('fft', () => {
  it('finds a pure tone', () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
    fft(re, im);
    const mags = [...re].map((r, i) => Math.hypot(r, im[i]!));
    expect(mags.indexOf(Math.max(...mags.slice(0, n / 2)))).toBe(5);
  });
});

describe('resample', () => {
  it('produces a uniform grid', () => {
    const out = resample([0, 0.5, 1], [0, 5, 10], 10);
    expect(out.length).toBe(11);
    expect(out[3]).toBeCloseTo(3);
  });
});

describe('bandpass', () => {
  it('keeps in-band tones and removes out-of-band ones', () => {
    const n = 600;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 1.2 * i) / FS) + Math.sin((2 * Math.PI * 8 * i) / FS);
    const peak = spectralPeak(bandpass(x, FS, 0.7, 3), FS, [0.5, 10]);
    expect(peak!.freq).toBeCloseTo(1.2, 1);
  });
});

describe('POS heart rate', () => {
  it.each([55, 72, 96, 130])('recovers %i bpm within ±3 bpm', (bpm) => {
    const r = estimate(synthetic(bpm, 20));
    expect(r.heartRate).not.toBeNull();
    expect(Math.abs(r.heartRate! - bpm)).toBeLessThan(3);
    expect(r.quality).toBeGreaterThan(0.5);
  });

  it('pure noise gets low quality', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
    const noise = synthetic(72, 20).map((s) => ({ t: s.t, r: 150 + 2 * rand(), g: 110 + 2 * rand(), b: 90 + 2 * rand() }));
    expect(estimate(noise).quality).toBeLessThan(0.5);
  });

  it('needs at least 5 seconds', () => {
    expect(estimate(synthetic(72, 3)).heartRate).toBeNull();
  });

  it('motion lowers quality', () => {
    const still = estimate(synthetic(72, 20));
    const moving = estimate(synthetic(72, 20), { motion: 0.6 });
    expect(moving.quality).toBeLessThan(still.quality);
  });
});
