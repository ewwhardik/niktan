import { describe, expect, it } from 'vitest';
import { mergeReadings, nameKey, similarity } from '../src/routes/rx';

const med = (name: string, extra: Record<string, unknown> = {}) => ({ name, confidence: 0.9, unclear: false, ...extra });

describe('prescription reading merge', () => {
  it('normalises names and scores spelling closeness', () => {
    expect(nameKey('Tab. Dolo 650')).toBe('dolo');
    expect(similarity('azithral', 'azithral')).toBe(1);
    expect(similarity('azithral', 'azitral')).toBeGreaterThan(0.8);
    expect(similarity('dolo', 'pand')).toBeLessThan(0.5);
  });

  it('confirms medicines both readers found', () => {
    const r = mergeReadings({ medicines: [med('Tab Dolo 650', { generic: 'paracetamol' })], advice: ['CBC'] }, { medicines: [med('Dolo 650')], advice: ['CBC test'] });
    expect(r.medicines[0]).toMatchObject({ agreed: true, unclear: false });
    expect(r.advice).toEqual(['CBC']);
  });

  it('offers the other reading when the two readers spell a name differently', () => {
    const r = mergeReadings({ medicines: [med('Azithral 500')] }, { medicines: [med('Azitral 500')] });
    expect(r.medicines[0]!.alternatives).toContain('Azitral 500');
  });

  it('marks a medicine only one reader saw, and keeps the extra find of the other reader', () => {
    const r = mergeReadings({ medicines: [med('Pan D'), med('Montair LC')] }, { medicines: [med('Pan D'), med('Shelcal')] });
    const byName = Object.fromEntries(r.medicines.map((m) => [m.name, m]));
    expect(byName['Pan D']).toMatchObject({ agreed: true });
    expect(byName['Montair LC']).toMatchObject({ unclear: true });
    expect(byName['Shelcal']).toMatchObject({ unclear: true, agreed: false });
    expect(r.medicines).toHaveLength(3);
  });

  it('pairs readings by ingredient but still asks for a check when the brand names differ', () => {
    const r = mergeReadings(
      { medicines: [med('Cap PanD', { generic: 'pantoprazole and domperidone' })] },
      { medicines: [med('Pantop-D', { generic: 'Pantoprazole and domperidone', duration: '7 days' })] },
    );
    expect(r.medicines).toHaveLength(1);
    expect(r.medicines[0]).toMatchObject({ agreed: false, unclear: true, duration: '7 days' });
    expect(r.medicines[0]!.alternatives).toContain('Pantop-D');
  });

  it('leaves agreement unknown when there was only one reader', () => {
    expect(mergeReadings({ medicines: [med('Dolo 650')] }, null).medicines[0]!.agreed).toBeNull();
  });
});
