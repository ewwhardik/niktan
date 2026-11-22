import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export const MEDIAPIPE_VERSION = '1.2.3';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Match the JS/WASM versions. Each camera session closes its own native model and GPU context. */
export async function loadFaceLandmarker(signal: AbortSignal, { pose = false } = {}): Promise<FaceLandmarker> {
  signal.throwIfAborted();
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
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
    model = await create('GPU');
  } catch {
    signal.throwIfAborted();
    model = await create('CPU');
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
}

/** Mean RGB of skin pixels inside the ROI polygons, read from a downscaled frame. */
export function sampleSkin(image: ImageData, lm: NormalizedLandmark[]): SkinSample | null {
  const { width: w, height: h, data } = image;
  const polys = Object.values(ROI).map((idx) => idx.map((i) => ({ x: lm[i]!.x * w, y: lm[i]!.y * h })));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  let total = 0;
  for (const poly of polys) {
    const previous = n;
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
        r += pr;
        g += pg;
        b += pb;
        n++;
      }
    }
    if (n - previous < 300 * (w / 640) ** 2) return null;
  }
  if (1 - n / total > 0.05) return null;
  r /= n;
  g /= n;
  b /= n;
  return { r, g, b, brightness: 0.299 * r + 0.587 * g + 0.114 * b, pixels: n };
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
