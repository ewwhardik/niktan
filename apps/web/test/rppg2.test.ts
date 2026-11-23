import { describe, expect, it } from 'vitest';
import { chrom, estimateMulti, trackRates, type MultiSample, type RoiName } from '../src/cv/rppg2';
import { estimate, FS, spectralPeak, type RgbSample } from '../src/cv/rppg';

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  };
}

interface Corruption {
  /** Region whose signal is spoiled. */
  roi?: RoiName;
  /** Strength of the spoiling component. */
  amount?: number;
  /** Frequency (Hz) of a periodic artefact, e.g. a flickering light or nodding. */
  artefactHz?: number;
  harmonic?: number;
}

/** Synthetic three-region trace: pulse mostly in green, independent noise per region. */
function synth(bpm: number, seconds: number, c: Corruption = {}, seed = 3): MultiSample[] {
  const rand = rng(seed);
  const out: MultiSample[] = [];
  let t = 0;
  while (t < seconds) {
    const ph = 2 * Math.PI * (bpm / 60) * t;
    const p = Math.sin(ph) + (c.harmonic ?? 0) * Math.sin(2 * ph);
    const drift = 3 * Math.sin(2 * Math.PI * 0.05 * t);
    const rois: MultiSample['rois'] = {};
    for (const roi of ['forehead', 'leftCheek', 'rightCheek'] as RoiName[]) {
      const bad = roi === c.roi;
      const art = bad && c.artefactHz ? (c.amount ?? 2) * Math.sin(2 * Math.PI * c.artefactHz * t) : 0;
      const noise = bad && !c.artefactHz ? (c.amount ?? 2) : 0.15;
      rois[roi] = {
        // Artefacts are coloured (warm light, flushing), which brightness-invariant methods can't cancel.
        r: 150 + drift + 0.3 * p + art + noise * rand(),
        g: 110 + drift + 0.8 * p + 0.25 * art + noise * rand(),
        b: 90 + drift + 0.2 * p - 0.4 * art + noise * rand(),
        n: 200,
      };
    }
    out.push({ t, rois });
    t += 1 / 30 + 0.004 * rand();
  }
  return out;
}

/** What v1 sees: the three regions averaged into one trace. */
function combined(samples: MultiSample[]): RgbSample[] {
  return samples.map((s) => {
    const v = Object.values(s.rois);
    return { t: s.t, r: v.reduce((a, x) => a + x!.r, 0) / v.length, g: v.reduce((a, x) => a + x!.g, 0) / v.length, b: v.reduce((a, x) => a + x!.b, 0) / v.length };
  });
}

describe('CHROM', () => {
  it('recovers a clean pulse', () => {
    const s = combined(synth(78, 20));
    const t = s.map((x) => x.t);
    const lerp = (k: 'r' | 'g' | 'b') => {
      const out = new Float64Array(Math.floor((t.at(-1)! - t[0]!) * FS));
      let j = 0;
      for (let i = 0; i < out.length; i++) {
        const ti = t[0]! + i / FS;
        while (j < t.length - 2 && t[j + 1]! < ti) j++;
        out[i] = s[j]![k];
      }
      return out;
    };
    const peak = spectralPeak(chrom(lerp('r'), lerp('g'), lerp('b')), FS, [0.7, 3]);
    expect(Math.abs(peak!.freq * 60 - 78)).toBeLessThan(3);
  });
});

describe('rPPG v2 fusion', () => {
  it.each([52, 70, 95, 128])('recovers %i bpm on clean multi-region traces', (bpm) => {
    const r = estimateMulti(synth(bpm, 30));
    expect(r.heartRate).not.toBeNull();
    expect(Math.abs(r.heartRate! - bpm)).toBeLessThan(2.5);
  });

  it('keeps the true rate when two regions carry differently coloured artefacts; v1 locks onto one', () => {
    // Forehead: warm flicker at 1.6 Hz. Left cheek: a different-coloured disturbance at 2.3 Hz
    // (138 bpm). POS cancels one colour direction, not two, so the averaged v1 trace follows 138.
    const rand = rng(11);
    const s: MultiSample[] = [];
    for (let t = 0; t < 30; t += 1 / 30 + 0.004 * rand()) {
      const p = Math.sin(2 * Math.PI * 1.2 * t);
      const drift = 3 * Math.sin(2 * Math.PI * 0.05 * t);
      const rois: MultiSample['rois'] = {};
      for (const roi of ['forehead', 'leftCheek', 'rightCheek'] as RoiName[]) {
        const a1 = roi === 'forehead' ? 4 * Math.sin(2 * Math.PI * 1.6 * t) : 0;
        const a2 = roi === 'leftCheek' ? 4 * Math.sin(2 * Math.PI * 2.3 * t + 1) : 0;
        rois[roi] = {
          r: 150 + drift + 0.3 * p + a1 - 0.3 * a2 + 0.15 * rand(),
          g: 110 + drift + 0.8 * p + 0.25 * a1 + a2 + 0.15 * rand(),
          b: 90 + drift + 0.2 * p - 0.4 * a1 + 0.5 * a2 + 0.15 * rand(),
          n: 200,
        };
      }
      s.push({ t, rois });
    }
    const v2 = estimateMulti(s);
    const v1 = estimate(combined(s));
    expect(Math.abs(v2.heartRate! - 72)).toBeLessThan(2);
    expect(v1.heartRate === null || Math.abs(v1.heartRate - 72) > 20).toBe(true);
  });

  it('stays on the fundamental when the second harmonic is strong', () => {
    const r = estimateMulti(synth(64, 30, { harmonic: 0.9 }, 5));
    expect(Math.abs(r.heartRate! - 64)).toBeLessThan(3);
  });

  it('survives one noisy region', () => {
    const r = estimateMulti(synth(88, 30, { roi: 'leftCheek', amount: 6 }, 9));
    expect(Math.abs(r.heartRate! - 88)).toBeLessThan(3);
  });

  it('gives low quality on pure noise', () => {
    const rand = rng(77);
    const s: MultiSample[] = Array.from({ length: 900 }, (_, i) => ({
      t: i / 30,
      rois: Object.fromEntries((['forehead', 'leftCheek', 'rightCheek'] as RoiName[]).map((k) => [k, { r: 150 + 2 * rand(), g: 110 + 2 * rand(), b: 90 + 2 * rand(), n: 100 }])),
    }));
    expect(estimateMulti(s).heartRate).toBeNull();
  });

  it('needs at least one 10 s window', () => {
    expect(estimateMulti(synth(70, 8)).heartRate).toBeNull();
  });
});

describe('tracking', () => {
  it('rejects a one-window jump to a stronger spurious peak', () => {
    const w = (main: number, alt: number, altWeight = 0.2) => ({ candidates: [{ bpm: main, weight: 0.6 }, { bpm: alt, weight: altWeight }], snrDb: 3, pulse: new Float64Array() });
    const windows = [w(72, 140), w(73, 141), { candidates: [{ bpm: 140, weight: 0.5 }, { bpm: 72, weight: 0.4 }], snrDb: 1, pulse: new Float64Array() }, w(72, 139), w(71, 140)];
    expect(trackRates(windows)).toEqual([72, 73, 72, 72, 71]);
  });
});

describe('face helpers', async () => {
  const { isSkin, LandmarkSmoother, regionPixelsChanged } = await import('../src/cv/face');

  it('ignores landmark jitter and background changes on a frozen portrait', () => {
    const frame = () => ({ width: 8, height: 8, data: Uint8ClampedArray.from({ length: 256 }, (_, i) => i) }) as ImageData;
    const before = frame();
    const after = frame();
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    after.data[0] = 99;
    expect(regionPixelsChanged(before, after, landmarks)).toBe(false);
    expect(regionPixelsChanged(before, after, landmarks.map(p => ({ ...p, x: 0.6 })))).toBe(false);
    after.data[(4 * 8 + 4) * 4 + 1] = 99;
    expect(regionPixelsChanged(before, after, landmarks)).toBe(true);
  });

  it('skin gate accepts typical skin tones and rejects hair, sky and foliage', () => {
    for (const [r, g, b] of [[224, 172, 140], [198, 134, 100], [141, 85, 60], [92, 58, 42]]) expect(isSkin(r!, g!, b!)).toBe(true);
    for (const [r, g, b] of [[20, 20, 22], [90, 140, 220], [60, 140, 60], [240, 240, 240]]) expect(isSkin(r!, g!, b!)).toBe(false);
  });

  it('One Euro filter cuts landmark jitter on a still face', () => {
    const f = new LandmarkSmoother();
    const rand = rng(5);
    let raw = 0;
    let smooth = 0;
    let prevRaw = 0.5;
    let prevSmooth = 0.5;
    for (let i = 0; i < 300; i++) {
      const p = [{ x: 0.5 + 0.004 * rand(), y: 0.5 }];
      const out = f.filter(p, i / 30)[0]!;
      if (i > 30) {
        raw += Math.abs(p[0]!.x - prevRaw);
        smooth += Math.abs(out.x - prevSmooth);
      }
      prevRaw = p[0]!.x;
      prevSmooth = out.x;
    }
    expect(smooth).toBeLessThan(raw * 0.35);
  });

  it('One Euro filter follows a real head movement without lagging far behind', () => {
    const f = new LandmarkSmoother();
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter([{ x: i < 30 ? 0.4 : 0.6, y: 0.5 }], i / 30)[0]!.x;
    expect(out).toBeGreaterThan(0.58);
  });
});
