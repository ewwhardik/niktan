import { describe, expect, it } from 'vitest';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { combineHeuristics, eyeHeuristics } from '../src/cv/eye';
import { EYE_CONTOUR, FACE_FRAME, IRIS } from '../src/cv/face';

type Rgb = [number, number, number];
const W = 400;
const H = 420;
const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const srgb = (v: number) => Math.round(255 * Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));

/** A warm household bulb, roughly 3000 K, applied in linear light. */
const WARM: Rgb = [1, 0.86, 0.6];
const NEUTRAL: Rgb = [1, 1, 1];

interface Scene { sclera: Rgb; pupil: Rgb; belowChin: Rgb; light: Rgb; eyesOpen?: number }

const EYES = { right: { x: 130, y: 150 }, left: { x: 270, y: 150 } };
const HALF_W = 40;
const IRIS_R = 14;
const PUPIL_R = 5;

function landmarks(open: number): NormalizedLandmark[] {
  const lm: NormalizedLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const at = (i: number, x: number, y: number) => { lm[i] = { x: x / W, y: y / H, z: 0, visibility: 1 }; };
  for (const side of ['right', 'left'] as const) {
    const c = EYES[side];
    EYE_CONTOUR[side].forEach((id, k) => {
      const t = Math.PI - (k * Math.PI) / 8;
      at(id, c.x + HALF_W * Math.cos(t), c.y - open * Math.sin(t));
    });
    const [centre, ...ring] = IRIS[side];
    at(centre!, c.x, c.y);
    ring.forEach((id, k) => at(id, c.x + IRIS_R * Math.cos((k * Math.PI) / 2), c.y + IRIS_R * Math.sin((k * Math.PI) / 2)));
  }
  at(FACE_FRAME.top, 200, 40);
  at(FACE_FRAME.chin, 200, 260);
  at(FACE_FRAME.right, 80, 170);
  at(FACE_FRAME.left, 320, 170);
  return lm;
}

function render(s: Scene): ImageData {
  const open = s.eyesOpen ?? 18;
  const data = new Uint8ClampedArray(W * H * 4);
  const lit = (c: Rgb): Rgb => c.map((v, i) => srgb(lin(v) * s.light[i]!)) as Rgb;
  const skin = lit([200, 150, 120]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = skin;
      if (y > 278 && x > 85 && x < 315) c = lit(s.belowChin);
      for (const e of Object.values(EYES)) {
        const inEye = ((x - e.x) / HALF_W) ** 2 + ((y - e.y) / open) ** 2 <= 1;
        const d = Math.hypot(x - e.x, y - e.y);
        if (inEye) c = d <= PUPIL_R ? lit(s.pupil) : d <= IRIS_R ? lit([70, 45, 30]) : lit(s.sclera);
      }
      data.set([...c, 255], (y * W + x) * 4);
    }
  }
  return { data, width: W, height: H, colorSpace: 'srgb' } as ImageData;
}

const HEALTHY: Rgb = [236, 233, 226];
const YELLOW: Rgb = [234, 214, 150];
const PAPER: Rgb = [238, 238, 238];
const BLACK: Rgb = [14, 12, 12];
const read = (s: Partial<Scene>) => eyeHeuristics(render({ sclera: HEALTHY, pupil: BLACK, belowChin: PAPER, light: NEUTRAL, ...s }), landmarks(s.eyesOpen ?? 18));

describe('sclera yellowness with a white reference', () => {
  it('finds the paper under the chin and reads a healthy eye as white even under a warm bulb', () => {
    const r = read({ light: WARM });
    expect(r.referenced).toBe(true);
    expect(r.eyesAgree).toBe(true);
    expect(r.scleraB!).toBeLessThan(10);
  });

  it('without the paper the same warm bulb makes the healthy eye look yellow, which is why it stays cautious', () => {
    const r = read({ light: WARM, belowChin: [200, 150, 120] });
    expect(r.referenced).toBe(false);
    expect(r.scleraB!).toBeGreaterThan(read({ light: WARM }).scleraB! + 15);
  });

  it('a jaundiced (yellow) sclera reads clearly yellow after correction, in warm or neutral light', () => {
    expect(read({ sclera: YELLOW, light: WARM }).scleraB!).toBeGreaterThan(21);
    expect(read({ sclera: YELLOW }).scleraB!).toBeGreaterThan(21);
  });

  it('skips eyes that are nearly closed', () => {
    const r = read({ eyesOpen: 5 });
    expect(r.eyesOpen).toBe(false);
    expect(r.scleraB).toBeNull();
  });
});

describe('pupil opacity', () => {
  it('a black pupil is clear; a grey-white pupil is opaque, even behind a dark brown iris', () => {
    expect(read({}).pupilOpacity!).toBeLessThan(0.2);
    expect(read({ pupil: [160, 158, 155] }).pupilOpacity!).toBeGreaterThan(0.45);
  });

  it('a red glow (retina through a clear lens) is not counted as opacity', () => {
    const r = read({ pupil: [190, 60, 40] });
    expect(r.redReflex).toBe(true);
    expect(r.pupilOpacity).toBe(0);
  });
});

describe('several frames', () => {
  it('takes medians so one bad frame does not decide', () => {
    const good = read({ sclera: YELLOW });
    const blink = read({ eyesOpen: 5 });
    const combined = combineHeuristics([good, blink, read({ sclera: YELLOW })])!;
    expect(combined.scleraB).toBeCloseTo(good.scleraB!, 5);
    expect(combineHeuristics([blink])).toBeNull();
  });
});
