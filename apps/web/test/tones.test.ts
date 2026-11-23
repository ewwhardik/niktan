import { describe, expect, it } from 'vitest';
import { CEILING_DB, FLOOR_DB, respondTone, scoreTones, SEQUENCE, startThreshold, type EarThresholds } from '../src/tests/tones';

/** A listener who hears everything at or above `true` dBFS. */
function run(trueThreshold: number) {
  let s = startThreshold();
  while (!s.done) s = respondTone(s, s.level >= trueThreshold);
  return s;
}

describe('tone thresholds', () => {
  it.each([-62, -45, -30, -18])('finds a %i dBFS listener within 5 dB', (t) => {
    const s = run(t);
    expect(s.threshold).not.toBeNull();
    expect(s.threshold! - t).toBeGreaterThanOrEqual(0);
    expect(s.threshold! - t).toBeLessThan(5);
    expect(s.presented).toBeLessThanOrEqual(14);
  });

  it('stops at the floor for very good hearing and reports no response above the ceiling', () => {
    expect(run(-100).threshold).toBe(FLOOR_DB);
    expect(run(0).threshold).toBeNull();
    expect(CEILING_DB).toBe(-10);
  });

  it('tests both ears at three frequencies', () => {
    expect(SEQUENCE).toHaveLength(6);
  });
});

describe('tone scoring', () => {
  const ear = (a: number, b: number, c: number): EarThresholds => ({ 1000: a, 2000: b, 4000: c });

  it('flags a clear difference between ears', () => {
    expect(scoreTones(ear(-60, -60, -55), ear(-40, -42, -38), 4, 0).asymmetry).toBe(true);
    expect(scoreTones(ear(-60, -60, -55), ear(-55, -58, -50), 4, 0).asymmetry).toBe(false);
  });

  it('flags a high-frequency drop', () => {
    expect(scoreTones(ear(-60, -55, -30), ear(-60, -55, -55), 4, 0).highDrop).toBe(true);
    expect(scoreTones(ear(-60, -55, -50), ear(-60, -55, -55), 4, 0).highDrop).toBe(false);
  });

  it('withholds flags when the listener answered silent trials', () => {
    const r = scoreTones(ear(-60, -60, -20), ear(-30, -30, -30), 4, 2);
    expect(r.reliable).toBe(false);
    expect(r.asymmetry).toBeNull();
    expect(r.highDrop).toBeNull();
  });
});
