import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { featuresFromPixels, predict, rgbToLab, selectPixels } from './anemia';
import { IRIS } from './face';

/**
 * Eye flags. Pallor uses the trained model; jaundice and cataract are uncalibrated heuristics
 * from the literature (BiliScreen-style sclera b*, leukocoria-style pupil brightness) and are
 * always labelled experimental.
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
  const [c, a, top, b, bottom] = IRIS[side].map((i) => lm[i]!);
  const r = (Math.hypot((a!.x - b!.x) * w, (a!.y - b!.y) * h) + Math.hypot((top!.x - bottom!.x) * w, (top!.y - bottom!.y) * h)) / 4;
  return { cx: c!.x * w, cy: c!.y * h, r };
}

function pixelsInRing(img: ImageData, g: IrisGeom, r0: number, r1: number): number[][] {
  const out: number[][] = [];
  const R = Math.ceil(g.r * r1);
  for (let y = Math.floor(g.cy - R); y <= g.cy + R; y++) {
    for (let x = Math.floor(g.cx - R); x <= g.cx + R; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const d = Math.hypot(x - g.cx, y - g.cy) / g.r;
      if (d < r0 || d > r1) continue;
      const k = (y * img.width + x) * 4;
      out.push([img.data[k]!, img.data[k + 1]!, img.data[k + 2]!]);
    }
  }
  return out;
}

export interface EyeHeuristics {
  scleraB: number | null;
  jaundice: boolean | null;
  pupilL: number | null;
  cataract: boolean | null;
}

/**
 * Looks at both eyes in a straight-ahead frame. Sclera = band beside the iris (1.3–2.6 iris radii
 * horizontally); pupil = disc of 0.35 r with the torch glint removed.
 */
export function eyeHeuristics(img: ImageData, lm: NormalizedLandmark[]): EyeHeuristics {
  const bVals: number[] = [];
  const lVals: number[] = [];
  const pupils: { P: number; I: number; chroma: number }[] = [];
  for (const side of ['left', 'right'] as const) {
    const g = irisGeom(lm, side, img.width, img.height);
    if (g.r < 3) continue;
    for (let y = Math.round(g.cy - g.r * 0.25); y <= g.cy + g.r * 0.25; y++) {
      for (const dir of [-1, 1]) {
        for (let dx = g.r * 1.3; dx <= g.r * 2.6; dx++) {
          const x = Math.round(g.cx + dir * dx);
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
          const k = (y * img.width + x) * 4;
          const r = img.data[k]!;
          const gg = img.data[k + 1]!;
          const b = img.data[k + 2]!;
          if (Math.max(r, gg, b) >= 250) continue;
          const [L, a, bb] = rgbToLab(r, gg, b);
          // Sclera is the bright, low-redness part; skin and caruncle have higher a*.
          if (a < 8 && L > 45) {
            bVals.push(bb);
            lVals.push(L);
          }
        }
      }
    }
    const pupil = pixelsInRing(img, g, 0, 0.35).filter((p) => Math.max(...p) < 240);
    const ring = pixelsInRing(img, g, 0.6, 0.9);
    if (pupil.length > 8 && ring.length > 8) {
      const labs = pupil.map(([r, gg, b]) => rgbToLab(r!, gg!, b!));
      const P = median(labs.map((l) => l[0]));
      const chroma = median(labs.map((l) => Math.hypot(l[1], l[2])));
      const I = median(ring.map(([r, gg, b]) => rgbToLab(r!, gg!, b!)[0]));
      pupils.push({ P, I, chroma });
    }
  }
  const scleraB = bVals.length >= 20 ? median(bVals) : null;
  const scleraL = lVals.length >= 20 ? median(lVals) : null;
  const jaundice = scleraB === null || scleraL === null ? null : scleraB >= 20 && scleraL > 50;
  const pupilL = pupils.length ? Math.max(...pupils.map((p) => p.P)) : null;
  const cataract = pupils.length ? pupils.some((p) => p.P >= 45 && p.chroma <= 20 && p.P - p.I >= 10) : null;
  return { scleraB, jaundice, pupilL, cataract };
}
