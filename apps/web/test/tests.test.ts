import { describe, expect, it } from 'vitest';
import { answer, optotypeMm, resultLogMar, snellen6, startStaircase, type StaircaseState } from '../src/tests/vision';
import { DIN, dinResult, randomTriplet, respond, speechGainForSnr, startDin } from '../src/tests/din';

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};

describe('vision optotype size', () => {
  it('logMAR 0 at 6 m is 8.73 mm tall', () => {
    expect(optotypeMm(0, 6000)).toBeCloseTo(8.73, 1);
  });
  it('logMAR 1.0 is ten times larger', () => {
    expect(optotypeMm(1, 400) / optotypeMm(0, 400)).toBeCloseTo(10, 1);
  });
  it('maps logMAR to Snellen', () => {
    expect(snellen6(0)).toBe('6/6');
    expect(snellen6(0.48)).toBe('6/18');
    expect(snellen6(1)).toBe('6/60');
  });
});

/** Simulates a person who reads everything at or above `limit` logMAR and guesses wrong below it. */
function runPerson(limit: number) {
  let s: StaircaseState = startStaircase(seq([0.1, 0.6, 0.3, 0.9]));
  let guard = 0;
  while (!s.done && guard++ < 200) {
    const reads = s.logMar >= limit - 1e-9;
    s = answer(s, reads ? s.current : s.current === 'up' ? 'down' : 'up', seq([0.2, 0.7]));
  }
  return resultLogMar(s);
}

describe('vision staircase', () => {
  it.each([0.0, 0.3, 0.6])('finds a %f logMAR limit', (limit) => {
    expect(runPerson(limit)).toBeCloseTo(limit, 5);
  });
  it('someone who cannot read the first line gets 1.1', () => {
    expect(runPerson(2)).toBe(1.1);
  });
  it('stops at the smallest line', () => {
    expect(runPerson(-0.5)).toBeCloseTo(-0.1, 5);
  });
});

describe('digits in noise', () => {
  it('triplets have 3 distinct digits', () => {
    for (let i = 0; i < 50; i++) expect(new Set(randomTriplet()).size).toBe(3);
  });

  it('runs exactly 23 triplets', () => {
    let s = startDin();
    let n = 0;
    while (!s.done) {
      s = respond(s, s.current);
      n++;
    }
    expect(n).toBe(DIN.triplets);
  });

  it('a listener who always hears correctly bottoms out and passes', () => {
    let s = startDin();
    while (!s.done) s = respond(s, s.current);
    expect(dinResult(s)).toMatchObject({ result: 'pass' });
  });

  it('a listener who never hears gets refer', () => {
    let s = startDin();
    while (!s.done) s = respond(s, 'xxx');
    expect(dinResult(s)!.result).toBe('refer');
    expect(s.snr).toBe(DIN.maxSnr);
  });

  it('a listener with threshold around -4 dB is referred', () => {
    let s = startDin();
    while (!s.done) s = respond(s, s.snr >= -4 ? s.current : '000');
    const r = dinResult(s)!;
    expect(r.srtDb).toBeGreaterThan(-6);
    expect(r.result).toBe('refer');
  });

  it('speech gain sets the requested SNR', () => {
    const g = speechGainForSnr(-6, 0.1, 0.1);
    expect(20 * Math.log10((0.1 * g) / 0.1)).toBeCloseTo(-6);
  });
});
