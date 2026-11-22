import { describe, expect, it } from 'vitest';
import golden from './fixtures/anemia-golden.json';
import { featuresFromPixels, predict, rgbToLab, selectPixels } from '../src/cv/anemia';

type Case = (typeof golden.cases)[number];

function flatten(c: Case) {
  const rgb: number[] = [];
  for (const row of c.pixels) for (const px of row) rgb.push(...px);
  const mask = c.mask ? (c.mask as number[][]).flat().map(Number) : null;
  return { rgb, mask };
}

describe('anaemia features match the Python reference', () => {
  it('Lab reference colours', () => {
    const ref = golden.labReference as Record<string, number[]>;
    const rgb: Record<string, [number, number, number]> = { white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], mid_grey: [128, 128, 128] };
    for (const [name, value] of Object.entries(rgb)) {
      const lab = rgbToLab(...value);
      lab.forEach((v, i) => expect(v).toBeCloseTo(ref[name]![i]!, 6));
    }
  });

  for (const c of golden.cases) {
    it(c.name, () => {
      const { rgb, mask } = flatten(c);
      const px = selectPixels(rgb, c.width, c.height, mask);
      expect(px.length).toBe(c.nKeptPixels);
      const feats = featuresFromPixels(px)!;
      for (const [k, v] of Object.entries(c.features)) expect(feats[k as keyof typeof feats]).toBeCloseTo(v as number, 9);
      const p = predict(feats);
      expect(p.logit).toBeCloseTo(c.logit, 9);
      expect(p.probability).toBeCloseTo(c.probability, 9);
      expect(p.flag).toBe(c.flagAnaemia);
    });
  }

  it('rejects too few pixels', () => {
    expect(featuresFromPixels([[200, 100, 100]])).toBeNull();
  });
});
