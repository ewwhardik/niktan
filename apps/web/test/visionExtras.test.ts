import { describe, expect, it } from 'vitest';
import { answerContrast, BAYER4, contrastScore, ditherFor, LEVELS, shownContrast, startContrast } from '../src/tests/contrast';
import { BACKGROUND, CONTROL, FIGURE, makeDots, makePlates, mulberry32, scoreColour } from '../src/tests/colorVision';

const lightness = (hex: string) => {
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const y = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  return 116 * Math.cbrt(y) - 16;
};
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

describe('contrast sensitivity', () => {
  it('dithers two grey levels to hit the intended physical contrast', () => {
    for (const level of LEVELS) {
      const d = ditherFor(level);
      expect(Math.abs(Math.log10(shownContrast(d)) + level)).toBeLessThan(0.005);
      // With 16 Bayer thresholds the realised share of hi pixels is within 1/32 of frac.
      const realised = BAYER4.filter((t) => t < d.frac).length / 16;
      expect(Math.abs(Math.log10(shownContrast({ ...d, frac: realised })) + level)).toBeLessThan(0.03);
    }
  });

  it('scores the last level with 2 of 3 correct', () => {
    let s = startContrast(mulberry32(1));
    // Answer correctly up to logCS 1.35, then wrongly.
    while (!s.done) s = answerContrast(s, LEVELS[s.level]! <= 1.35 ? s.current : 'unsure', mulberry32(s.level + 2));
    expect(contrastScore(s)).toBe(1.35);
  });

  it('scores a failed first level below the chart', () => {
    let s = startContrast();
    s = answerContrast(s, 'unsure');
    s = answerContrast(s, 'unsure');
    expect(s.done).toBe(true);
    expect(contrastScore(s)).toBe(0.3);
  });

  it('reaches the top level for perfect answers', () => {
    let s = startContrast();
    while (!s.done) s = answerContrast(s, s.current);
    expect(contrastScore(s)).toBe(1.95);
  });
});

describe('colour plates', () => {
  it('figure and background have matched lightness, the control does not', () => {
    expect(Math.abs(mean(FIGURE.map(lightness)) - mean(BACKGROUND.map(lightness)))).toBeLessThan(2);
    expect(mean(BACKGROUND.map(lightness)) - mean(CONTROL.map(lightness))).toBeGreaterThan(15);
  });

  it('packs non-overlapping dots inside the plate and colours the digit area', () => {
    const plate = { kind: 'redGreen' as const, digit: 5, options: [2, 5, 7, 9], seed: 42 };
    const dots = makeDots(plate, 300, (x) => x > 120 && x < 180, 3000);
    expect(dots.length).toBeGreaterThan(150);
    for (const d of dots) expect(Math.hypot(d.x - 150, d.y - 150) + d.r).toBeLessThanOrEqual(150);
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      expect(Math.hypot(dots[i]!.x - dots[j]!.x, dots[i]!.y - dots[j]!.y)).toBeGreaterThanOrEqual(dots[i]!.r + dots[j]!.r);
    }
    expect(dots.filter((d) => d.x > 120 && d.x < 180).every((d) => FIGURE.includes(d.color))).toBe(true);
    expect(makeDots(plate, 300, () => false, 500)).toEqual(makeDots(plate, 300, () => false, 500));
  });

  it('starts with a control plate and offers the right digit among four choices', () => {
    const plates = makePlates(mulberry32(7));
    expect(plates).toHaveLength(6);
    expect(plates[0]!.kind).toBe('control');
    for (const p of plates) {
      expect(p.options).toContain(p.digit);
      expect(new Set(p.options).size).toBe(4);
    }
  });

  it('flags two or more red-green misses, and voids the result if the control was missed', () => {
    const plates = makePlates(mulberry32(3));
    const right = plates.map((p) => p.digit);
    expect(scoreColour(plates, right).flag).toBe(false);
    expect(scoreColour(plates, right.map((d, i) => (i === 2 || i === 4 ? null : d))).flag).toBe(true);
    expect(scoreColour(plates, right.map((d, i) => (i === 3 ? null : d))).flag).toBe(false);
    expect(scoreColour(plates, right.map((d, i) => (i === 0 ? null : d))).flag).toBeNull();
  });
});
