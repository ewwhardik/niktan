import { describe, expect, it } from 'vitest';
import { findTest, flagFor, isUrgent, parseRange } from '../src/lib/labCatalog';
import { explain } from '../src/routes/lab';
import { expiryMonth, withSaving } from '../src/routes/meds';

describe('lab report flags', () => {
  it('parses printed reference ranges', () => {
    expect(parseRange('13.0 - 17.0')).toEqual({ low: 13, high: 17 });
    expect(parseRange('4,000–11,000')).toEqual({ low: 4000, high: 11000 });
    expect(parseRange('< 200')).toEqual({ low: null, high: 200 });
    expect(parseRange('Up to 40')).toEqual({ low: null, high: 40 });
    expect(parseRange('> 40')).toEqual({ low: 40, high: null });
    expect(parseRange('Negative')).toBeNull();
  });

  it('flags from the value and the range only', () => {
    expect(flagFor('10.2', { low: 13, high: 17 })).toBe('low');
    expect(flagFor('1,52,000', { low: 150000, high: 410000 })).toBe('normal');
    expect(flagFor('Positive', { low: 1, high: 2 })).toBeNull();
  });

  it('matches common test names', () => {
    expect(findTest('Haemoglobin (Hb)')?.key).toBe('hb');
    expect(findTest('S.G.P.T (ALT)')?.key).toBe('alt');
    expect(findTest('Glucose Fasting')?.key).toBe('glucoseFasting');
    expect(findTest('Thyroid Stimulating Hormone')?.key).toBe('tsh');
  });

  it('marks urgent values only in the expected unit', () => {
    expect(isUrgent(findTest('Hemoglobin'), '6.1', 'g/dL')).toBe(true);
    expect(isUrgent(findTest('Hemoglobin'), '6.1', 'mmol/L')).toBe(false);
    expect(isUrgent(findTest('Platelet Count'), '0.4', 'lakh/cumm')).toBe(true);
  });

  it('explains a report without trusting model flags', () => {
    const out = explain({ tests: [
      { name: 'Hemoglobin', value: '10.5', unit: 'g/dL', range: '13 - 17', flag: null },
      { name: 'TSH', value: '2.1', unit: 'µIU/mL', range: '0.4 - 4.5', flag: 'H' },
      { name: 'Urine colour', value: 'Pale yellow', unit: null, range: null, flag: null },
    ] }, 'en');
    expect(out.tests.map((t) => t.flag)).toEqual(['low', 'normal', null]);
    expect(out.tests[0]!.note).toMatch(/anaemia/);
    expect(out.counts).toEqual({ low: 1, high: 0, normal: 1, unknown: 1 });
  });
});

describe('medicine pack helpers', () => {
  it('reads expiry dates', () => {
    expect(expiryMonth('EXP 03/2027')).toBe('2027-03');
    expect(expiryMonth('Exp. Mar 2027')).toBe('2027-03');
    expect(expiryMonth('EXP.11/26')).toBe('2026-11');
    expect(expiryMonth('2027-08')).toBe('2027-08');
    expect(expiryMonth(null)).toBeNull();
  });

  it('computes per-unit savings against the brand price', () => {
    const [g] = withSaving([{ code: '1', name: 'x', unit: "10's", mrp: 9.9, group: '', perUnit: 0.99, score: 1, exact: true }], 120, '15 tablets');
    expect(g!.savingPercent).toBe(88);
  });
});

describe('typical ranges', () => {
  it('flags from the typical adult range only when the unit matches', () => {
    const out = explain({ tests: [
      { name: 'Fasting Blood Sugar', value: '142', unit: 'mg/dL', range: null, flag: null },
      { name: 'Fasting Blood Sugar', value: '142', unit: 'mmol/L', range: null, flag: null },
    ] }, 'en');
    expect(out.tests[0]).toMatchObject({ flag: 'high', flagSource: 'typical', range: '70 - 100' });
    expect(out.tests[1]!.flag).toBeNull();
  });
});
