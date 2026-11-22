import model from './models/anemiaModel.json';

/**
 * Conjunctival pallor features and logistic model, ported line-for-line from the Python reference
 * (ml/anemia/features.py). Golden vectors in test/fixtures keep both implementations identical.
 */

export const HIGHLIGHT_MAX = 250;
export const SHADOW_MIN = 20;
export const MIN_PIXELS = 50;

const M = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const;
const WHITE = [0.95047, 1.0, 1.08883] as const;
const DELTA = 6 / 29;

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const f = (t: number) => (t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA ** 2) + 4 / 29);

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = M[0][0] * R + M[0][1] * G + M[0][2] * B;
  const y = M[1][0] * R + M[1][1] * G + M[1][2] * B;
  const z = M[2][0] * R + M[2][1] * G + M[2][2] * B;
  const fx = f(x / WHITE[0]);
  const fy = f(y / WHITE[1]);
  const fz = f(z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function percentile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Keeps mask pixels that are neither specular highlights nor shadow. Default mask = centre 50 %. */
export function selectPixels(rgba: ArrayLike<number>, width: number, height: number, mask?: ArrayLike<number> | null): number[][] {
  const out: number[][] = [];
  const r0 = Math.floor(height / 4);
  const r1 = Math.floor((3 * height) / 4);
  const c0 = Math.floor(width / 4);
  const c1 = Math.floor((3 * width) / 4);
  const channels = rgba.length / (width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const inMask = mask ? mask[i]! > 0 : y >= r0 && y < r1 && x >= c0 && x < c1;
      if (!inMask) continue;
      const k = i * channels;
      const r = rgba[k]!;
      const g = rgba[k + 1]!;
      const b = rgba[k + 2]!;
      const mx = Math.max(r, g, b);
      if (mx < HIGHLIGHT_MAX && mx > SHADOW_MIN) out.push([r, g, b]);
    }
  }
  return out;
}

export type Features = Record<(typeof model.features)[number], number>;

export function featuresFromPixels(px: number[][]): Features | null {
  if (px.length < MIN_PIXELS) return null;
  const n = px.length;
  const L: number[] = [];
  const A: number[] = [];
  const B: number[] = [];
  const EI: number[] = [];
  let rch = 0;
  let gr = 0;
  for (const [r, g, b] of px) {
    const [l, a, bb] = rgbToLab(r!, g!, b!);
    L.push(l);
    A.push(a);
    B.push(bb);
    EI.push(100 * Math.log10((r! + 1) / (g! + 1)));
    rch += r! / (r! + g! + b!);
    gr += (g! + 1) / (r! + 1);
  }
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const sa = [...A].sort((x, y) => x - y);
  const sl = [...L].sort((x, y) => x - y);
  const se = [...EI].sort((x, y) => x - y);
  return {
    a_mean: mean(A),
    a_median: percentile(sa, 0.5),
    a_p25: percentile(sa, 0.25),
    a_p75: percentile(sa, 0.75),
    L_mean: mean(L),
    L_median: percentile(sl, 0.5),
    b_mean: mean(B),
    ei_mean: mean(EI),
    ei_median: percentile(se, 0.5),
    rch_mean: rch / n,
    gr_mean: gr / n,
  } as Features;
}

export function predict(features: Features): { probability: number; logit: number; flag: boolean } {
  let logit = model.intercept;
  model.features.forEach((name, i) => {
    const z = (features[name as keyof Features] - model.standardization.mean[i]!) / model.standardization.std[i]!;
    logit += model.coefficients[i]! * z;
  });
  const probability = 1 / (1 + Math.exp(-logit));
  return { probability, logit, flag: probability >= model.threshold };
}

export const ANEMIA_MODEL_VERSION = `${model.name}@${model.version}`;
export const ANEMIA_THRESHOLD = model.threshold;
