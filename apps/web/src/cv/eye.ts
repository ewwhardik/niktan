import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { featuresFromPixels, linearToLab, predict, selectPixels } from './anemia';
import { EYE_CONTOUR, FACE_FRAME, IRIS, LOWER_LID } from './face';

/**
 * Eye measurements. Pallor uses the trained model. Jaundice and cataract are measured here and
 * fused with symptoms in @niktan/core (assessJaundice / assessCataract):
 * - Sclera yellowness follows BiliScreen and neoSCB: segment the sclera precisely, then remove the
 *   room's light colour with a white reference held in the same photo, and read CIELAB b*.
 * - Pupil opacity: a clear lens leaves the pupil near-black; a cataract scatters light back so the
 *   pupil turns grey or white. It is measured against the sclera of the same eye, so a dark brown
 *   iris does not hide it, and the phone screen lights the eye when there is no torch.
 */

export interface Crop {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function cropImage(img: ImageData, x: number, y: number, w: number, h: number): Crop {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const cw = Math.max(1, Math.min(img.width - x0, Math.round(w)));
  const ch = Math.max(1, Math.min(img.height - y0, Math.round(h)));
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const src = ((y0 + row) * img.width + x0) * 4;
    out.set(img.data.subarray(src, src + cw * 4), row * cw * 4);
  }
  return { data: out, width: cw, height: ch };
}

interface Box { x: number; y: number; w: number; h: number }

/** Locate the lower lid within the user-aligned guide. All coordinates refer to the unmirrored still. */
export function locateLowerLid(lm: NormalizedLandmark[], width: number, height: number, guide: Box): Box | null {
  let closest: Box | null = null;
  let nearest = Infinity;
  for (const contour of Object.values(LOWER_LID)) {
    const lid = contour.map((id) => lm[id]!);
    const first = lid[0]!;
    const last = lid[lid.length - 1]!;
    const eyeWidth = Math.hypot((last.x - first.x) * width, (last.y - first.y) * height);
    const cx = (first.x + last.x) * width / 2;
    const y = Math.max(...lid.map((p) => p.y)) * height;
    const box = { x: cx - 0.6 * eyeWidth, y, w: 1.2 * eyeWidth, h: 0.6 * eyeWidth };
    const cy = y + box.h / 2;
    if (eyeWidth < 25 || box.x < 0 || box.x + box.w > width || y < 0 || y + box.h > height) continue;
    if (cx < guide.x || cx > guide.x + guide.w || cy < guide.y || cy > guide.y + guide.h) continue;
    const distance = Math.hypot(cx - guide.x - guide.w / 2, cy - guide.y - guide.h / 2);
    if (distance < nearest) {
      nearest = distance;
      closest = box;
    }
  }
  return closest;
}

export interface PallorResult {
  probability: number;
  flag: boolean;
  pixels: number;
}

/** Runs the pallor model on a conjunctiva crop (centre 50 % of the crop, per the training spec). */
export function pallorFromCrop(crop: Crop): PallorResult | null {
  const px = selectPixels(crop.data, crop.width, crop.height, null);
  const feats = featuresFromPixels(px);
  if (!feats) return null;
  const { probability, flag } = predict(feats);
  return { probability, flag, pixels: px.length };
}

const median = (v: number[]) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

interface IrisGeom {
  cx: number;
  cy: number;
  r: number;
}

function irisGeom(lm: NormalizedLandmark[], side: 'left' | 'right', w: number, h: number): IrisGeom {
  const [c, ...ring] = IRIS[side].map((i) => lm[i]!);
  const r = ring.reduce((sum, p) => sum + Math.hypot((p.x - c!.x) * w, (p.y - c!.y) * h), 0) / ring.length;
  return { cx: c!.x * w, cy: c!.y * h, r };
}

const LIN = Float64Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

interface Px { R: number; G: number; B: number; L: number; a: number; b: number }
type Rgb = [number, number, number];

function pixelAt(img: ImageData, x: number, y: number): Px | null {
  const k = (y * img.width + x) * 4;
  const r = img.data[k]!;
  const g = img.data[k + 1]!;
  const b = img.data[k + 2]!;
  if (Math.max(r, g, b) >= 250) return null; // clipped: the true colour is unknown
  const R = LIN[r]!;
  const G = LIN[g]!;
  const B = LIN[b]!;
  const [L, a, bb] = linearToLab(R, G, B);
  return { R, G, B, L, a, b: bb };
}

function insidePolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const channelMedian = (px: Px[]): Rgb => [median(px.map((p) => p.R)), median(px.map((p) => p.G)), median(px.map((p) => p.B))];

/**
 * CIELAB b* of a colour after dividing out a reference white (von Kries) and scaling to the
 * lightness of a typical sclera, so neither the light's colour nor the exposure changes the score.
 * With no reference the camera's own white balance is all there is.
 */
export function yellowness(rgb: Rgb, ref: Rgb | null): number {
  const w = ref ?? [1, 1, 1];
  const X = rgb.map((c, i) => c / Math.max(1e-6, w[i]!)) as Rgb;
  const Y = 0.2126 * X[0] + 0.7152 * X[1] + 0.0722 * X[2];
  const k = 0.7 / Math.max(1e-6, Y);
  return linearToLab(X[0] * k, X[1] * k, X[2] * k)[2];
}

interface ScleraReading { rgb: Rgb; L: number; a: number; b: number; pixels: number }

/** Sclera = inside the eyelid contour, outside the iris, minus vessels, caruncle, lashes and glints. */
export function scleraOf(img: ImageData, lm: NormalizedLandmark[], side: 'left' | 'right', g: IrisGeom): ScleraReading | null {
  const poly = EYE_CONTOUR[side].map((i) => ({ x: lm[i]!.x * img.width, y: lm[i]!.y * img.height }));
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const px: Px[] = [];
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(img.height - 1, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(img.width - 1, Math.ceil(Math.max(...xs))); x++) {
      if (!insidePolygon(x + 0.5, y + 0.5, poly) || Math.hypot(x - g.cx, y - g.cy) < g.r * 1.15) continue;
      const p = pixelAt(img, x, y);
      if (p && p.L >= 30) px.push(p);
    }
  }
  if (px.length < 25) return null;
  // Red vessels and the pink caruncle sit well above the sclera's typical redness.
  const medA = median(px.map((p) => p.a));
  const pale = px.filter((p) => p.a <= medA + 4).sort((p, q) => q.L - p.L);
  // Skip the brightest tenth (wet glints) and keep the next half: lit sclera, not shadowed corners.
  const band = pale.slice(Math.floor(pale.length * 0.1), Math.floor(pale.length * 0.6));
  if (band.length < 12) return null;
  const rgb = channelMedian(band);
  const [L, a, b] = linearToLab(...rgb);
  return { rgb, L, a, b, pixels: band.length };
}

/** Pupil centre (0.25 iris radii, inside even a constricted pupil) without the screen's reflection. */
export function pupilOf(img: ImageData, g: IrisGeom, scleraL: number): { L: number; chroma: number; a: number } | null {
  const px: Px[] = [];
  const R = Math.ceil(g.r * 0.25);
  for (let y = Math.floor(g.cy - R); y <= g.cy + R; y++) {
    for (let x = Math.floor(g.cx - R); x <= g.cx + R; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height || Math.hypot(x - g.cx, y - g.cy) > g.r * 0.25) continue;
      const p = pixelAt(img, x, y);
      if (p && p.L < scleraL * 0.92) px.push(p);
    }
  }
  if (px.length < 6) return null;
  const dark = px.sort((p, q) => p.L - q.L).slice(0, Math.max(6, Math.ceil(px.length * 0.7)));
  return { L: median(dark.map((p) => p.L)), chroma: median(dark.map((p) => Math.hypot(p.a, p.b))), a: median(dark.map((p) => p.a)) };
}

/**
 * A white reference in the same photo: paper (or a white cloth) held just under the chin. It must be
 * bright, about as neutral as the sclera (skin is far redder) and even in colour.
 */
export function whiteReference(img: ImageData, lm: NormalizedLandmark[], sclera: { a: number; b: number } | null): Rgb | null {
  const W = img.width;
  const H = img.height;
  const chin = lm[FACE_FRAME.chin]!;
  const faceH = (chin.y - lm[FACE_FRAME.top]!.y) * H;
  const x0 = Math.max(0, Math.floor(Math.min(lm[FACE_FRAME.right]!.x, lm[FACE_FRAME.left]!.x) * W));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(lm[FACE_FRAME.right]!.x, lm[FACE_FRAME.left]!.x) * W));
  const y0 = Math.max(0, Math.floor(chin.y * H + 0.08 * faceH));
  const y1 = Math.min(H - 1, Math.ceil(chin.y * H + 0.9 * faceH));
  if (faceH <= 0 || y1 - y0 < 16 || x1 - x0 < 16) return null;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 40_000)));
  let total = 0;
  const cand: Px[] = [];
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      total++;
      const p = pixelAt(img, x, y);
      if (!p || p.L < 50 || Math.hypot(p.a, p.b) > 30) continue;
      if (sclera && (p.a > sclera.a + 6 || p.b > sclera.b + 6)) continue;
      cand.push(p);
    }
  }
  if (cand.length < Math.max(120, total * 0.08)) return null;
  const lit = cand.sort((p, q) => q.L - p.L).slice(Math.floor(cand.length * 0.05), Math.floor(cand.length * 0.65));
  const sum = (p: Px) => p.R + p.G + p.B;
  const spread = (vals: number[]) => {
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length);
  };
  if (spread(lit.map((p) => p.R / sum(p))) > 0.02 || spread(lit.map((p) => p.B / sum(p))) > 0.02) return null;
  return channelMedian(lit);
}

export interface EyeHeuristics {
  /** Sclera yellowness (CIELAB b*), white-referenced when `referenced`. */
  scleraB: number | null;
  referenced: boolean;
  eyesAgree: boolean | null;
  /** Pupil lightness / sclera lightness; 0 for a red (clear) reflex. */
  pupilOpacity: number | null;
  redReflex: boolean;
  /** At least one eye was open wide enough to see sclera beside the iris. */
  eyesOpen: boolean;
}

/** Straight-ahead frame: both eyes' sclera colour and pupil opacity, plus a white reference if one is held up. */
export function eyeHeuristics(img: ImageData, lm: NormalizedLandmark[]): EyeHeuristics {
  const eyes: { sclera: ScleraReading; opacity: number | null; red: boolean }[] = [];
  let open = false;
  for (const side of ['left', 'right'] as const) {
    const g = irisGeom(lm, side, img.width, img.height);
    if (g.r < 5) continue;
    const c = EYE_CONTOUR[side].map((i) => lm[i]!);
    const width = Math.hypot((c[0]!.x - c[8]!.x) * img.width, (c[0]!.y - c[8]!.y) * img.height);
    const height = (Math.max(...c.map((p) => p.y)) - Math.min(...c.map((p) => p.y))) * img.height;
    if (width <= 0 || height / width < 0.2) continue;
    open = true;
    const sclera = scleraOf(img, lm, side, g);
    if (!sclera) continue;
    const pupil = pupilOf(img, g, sclera.L);
    // A red or orange glow is the retina seen through a clear lens: no opacity.
    const red = !!pupil && pupil.a > 12 && pupil.chroma > 20;
    const opacity = pupil ? (pupil.chroma > 20 ? 0 : Math.max(0, pupil.L / Math.max(1, sclera.L))) : null;
    eyes.push({ sclera, opacity, red });
  }
  const raw = eyes.map((e) => ({ a: e.sclera.a, b: e.sclera.b }));
  const ref = whiteReference(img, lm, raw.length ? { a: median(raw.map((r) => r.a)), b: median(raw.map((r) => r.b)) } : null);
  const bs = eyes.map((e) => yellowness(e.sclera.rgb, ref));
  const opacities = eyes.map((e) => e.opacity).filter((o): o is number => o !== null);
  return {
    scleraB: bs.length ? bs.reduce((s, v) => s + v, 0) / bs.length : null,
    referenced: !!ref && bs.length > 0,
    eyesAgree: bs.length === 2 ? Math.abs(bs[0]! - bs[1]!) <= 6 : null,
    pupilOpacity: opacities.length ? Math.round(Math.min(1.5, Math.max(...opacities)) * 1000) / 1000 : null,
    redReflex: eyes.some((e) => e.red),
    eyesOpen: open,
  };
}

/** Several frames a moment apart: medians, so one blink or glint does not decide the result. */
export function combineHeuristics(frames: EyeHeuristics[]): EyeHeuristics | null {
  const ok = frames.filter((f) => f.scleraB !== null || f.pupilOpacity !== null);
  if (!ok.length) return null;
  const med = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null);
    return v.length ? median(v) : null;
  };
  const majority = (vals: (boolean | null)[]) => {
    const v = vals.filter((x): x is boolean => x !== null);
    return v.length ? v.filter(Boolean).length * 2 >= v.length : null;
  };
  return {
    scleraB: med(ok.map((f) => f.scleraB)),
    referenced: ok.filter((f) => f.referenced).length * 2 > ok.length,
    eyesAgree: majority(ok.map((f) => f.eyesAgree)),
    pupilOpacity: med(ok.map((f) => f.pupilOpacity)),
    redReflex: majority(ok.map((f) => f.redReflex)) ?? false,
    eyesOpen: ok.some((f) => f.eyesOpen),
  };
}
