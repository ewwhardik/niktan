import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Match the JS/WASM versions. Each camera session closes its own native model and GPU context. */
export async function loadFaceLandmarker(signal: AbortSignal, { pose = false, preferCpu = false } = {}): Promise<FaceLandmarker> {
  signal.throwIfAborted();
  const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = { wasmLoaderPath, wasmBinaryPath };
  const create = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numFaces: 2, // A second face invalidates the sample.
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: pose,
    });
  signal.throwIfAborted();
  let model: FaceLandmarker;
  try {
    model = await create(preferCpu ? 'CPU' : 'GPU');
  } catch {
    signal.throwIfAborted();
    model = await create(preferCpu ? 'GPU' : 'CPU');
  }
  if (signal.aborted) {
    model.close();
    throw new DOMException('Camera stopped', 'AbortError');
  }
  signal.addEventListener('abort', () => model.close(), { once: true });
  return model;
}

/** Skin regions for rPPG: forehead and both cheeks, avoiding eyes, brows, nostrils and mouth. */
export const ROI = {
  forehead: [67, 109, 10, 338, 297, 299, 337, 151, 108, 69],
  rightCheek: [116, 117, 118, 119, 100, 36, 205, 187, 147, 123],
  leftCheek: [345, 346, 347, 348, 329, 266, 425, 411, 376, 352],
};

/** Iris landmarks (present in FaceLandmarker's 478-point output). */
export const IRIS = { right: [468, 469, 470, 471, 472], left: [473, 474, 475, 476, 477] };
/** Lower eyelid contour points, used to place the conjunctiva crop box. */
export const LOWER_LID = { right: [33, 7, 163, 144, 145, 153, 154, 155, 133], left: [263, 249, 390, 373, 374, 380, 381, 382, 362] };

type Pt = { x: number; y: number };

function inPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface SkinSample {
  r: number;
  g: number;
  b: number;
  brightness: number;
  pixels: number;
  /** Per-region means for the multi-region rPPG fusion. */
  rois: Record<keyof typeof ROI, { r: number; g: number; b: number; n: number }>;
}

/** Skin-colour gate in YCrCb (Chai & Ngan 1999): drops hair, eyebrows and background pixels. */
export function isSkin(r: number, g: number, b: number): boolean {
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  return cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127;
}

/** Compare the same sensor pixels across frames, independent of jitter in the landmark model. */
export function regionPixelsChanged(previous: ImageData, current: ImageData, landmarks: Pt[]): boolean {
  if (previous.width !== current.width || previous.height !== current.height) return true;
  for (const polygon of Object.values(ROI)) {
    const cx = polygon.reduce((sum, index) => sum + landmarks[index]!.x, 0) / polygon.length;
    const cy = polygon.reduce((sum, index) => sum + landmarks[index]!.y, 0) / polygon.length;
    for (const index of polygon) {
      const point = landmarks[index]!;
      const x = Math.max(0, Math.min(current.width - 1, Math.floor((cx + point.x) * 0.5 * current.width)));
      const y = Math.max(0, Math.min(current.height - 1, Math.floor((cy + point.y) * 0.5 * current.height)));
      const offset = (y * current.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        if (previous.data[offset + channel] !== current.data[offset + channel]) return true;
      }
    }
  }
  return false;
}

/** Mean RGB of skin pixels inside the ROI polygons, read from a downscaled frame. */
export function sampleSkin(image: ImageData, lm: NormalizedLandmark[], { skinMask = false } = {}): SkinSample | null {
  const { width: w, height: h, data } = image;
  const names = Object.keys(ROI) as (keyof typeof ROI)[];
  const polys = names.map((k) => ROI[k].map((i) => ({ x: lm[i]!.x * w, y: lm[i]!.y * h })));
  const rois = {} as SkinSample['rois'];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  let total = 0;
  for (const [pi, poly] of polys.entries()) {
    const previous = n;
    let rr = 0;
    let rg = 0;
    let rb = 0;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!inPolygon(x + 0.5, y + 0.5, poly)) continue;
        total++;
        const k = (y * w + x) * 4;
        const pr = data[k]!;
        const pg = data[k + 1]!;
        const pb = data[k + 2]!;
        // Skip clipped highlights and deep shadows, which carry no pulse signal.
        if (Math.max(pr, pg, pb) >= 250 || Math.min(pr, pg, pb) <= 5) continue;
        if (skinMask && !isSkin(pr, pg, pb)) {
          total--;
          continue;
        }
        rr += pr;
        rg += pg;
        rb += pb;
        n++;
      }
    }
    const count = n - previous;
    if (count < 300 * (w / 640) ** 2) return null;
    rois[names[pi]!] = { r: rr / count, g: rg / count, b: rb / count, n: count };
    r += rr;
    g += rg;
    b += rb;
  }
  if (1 - n / total > 0.05) return null;
  r /= n;
  g /= n;
  b /= n;
  return { r, g, b, brightness: 0.299 * r + 0.587 * g + 0.114 * b, pixels: n, rois };
}

/** Face box size and centre in normalised units, for framing guidance and motion. */
export function faceGeometry(lm: NormalizedLandmark[]) {
  let x0 = 1;
  let x1 = 0;
  let y0 = 1;
  let y1 = 0;
  for (const p of lm) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, width: x1 - x0, height: y1 - y0 };
}

/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012) for landmarks: smooths sub-pixel jitter when
 * the face is still, follows quickly when it moves. Stable regions mean the same skin pixels are
 * averaged frame to frame, which removes a large share of rPPG noise.
 */
export class LandmarkSmoother {
  private prev: { x: number; y: number }[] | null = null;
  private dprev: { x: number; y: number }[] | null = null;
  private tPrev = 0;
  constructor(private minCutoff = 1.2, private beta = 0.02, private dCutoff = 1) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset() {
    this.prev = null;
    this.dprev = null;
  }

  filter<T extends { x: number; y: number }>(points: T[], t: number): T[] {
    if (!this.prev || this.prev.length !== points.length || t <= this.tPrev) {
      this.prev = points.map((p) => ({ x: p.x, y: p.y }));
      this.dprev = points.map(() => ({ x: 0, y: 0 }));
      this.tPrev = t;
      return points;
    }
    const dt = Math.min(0.2, t - this.tPrev);
    this.tPrev = t;
    const ad = LandmarkSmoother.alpha(this.dCutoff, dt);
    return points.map((p, i) => {
      const prev = this.prev![i]!;
      const dprev = this.dprev![i]!;
      const dx = ad * ((p.x - prev.x) / dt) + (1 - ad) * dprev.x;
      const dy = ad * ((p.y - prev.y) / dt) + (1 - ad) * dprev.y;
      const speed = Math.hypot(dx, dy);
      const a = LandmarkSmoother.alpha(this.minCutoff + this.beta * speed, dt);
      const x = a * p.x + (1 - a) * prev.x;
      const y = a * p.y + (1 - a) * prev.y;
      this.prev![i] = { x, y };
      this.dprev![i] = { x: dx, y: dy };
      return { ...p, x, y };
    });
  }
}
