import { describe, expect, it } from 'vitest';
import { findGenerics, ingredientsOf, searchProducts, strengthsOf, unitsOf, type Product } from '../src/lib/janaushadhi';

// Rows in the shape of the official Product & MRP List (values are illustrative).
const LIST: Product[] = [
  ['1', 'Aceclofenac 100mg and Paracetamol 325mg Tablets', "10's", 10.32, 'Analgesic'],
  ['36', 'Paracetamol Tablets IP 500 mg', "10's", 4.6, 'Analgesic'],
  ['37', 'Paracetamol Tablets IP 650 mg', "15's", 8.9, 'Analgesic'],
  ['38', 'Paracetamol Oral Suspension IP 125mg/5ml', '60 ml', 11.25, 'Analgesic'],
  ['90', 'Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg', "6's", 48.5, 'Anti-infective'],
  ['120', 'Pantoprazole Gastro-resistant Tablets IP 40 mg', "10's", 9.9, 'Gastro'],
  ['121', 'Pantoprazole 40 mg and Domperidone 30 mg Prolonged Release Capsules', "10's", 22.4, 'Gastro'],
  ['300', 'Atorvastatin Tablets IP 10 mg', "10's", 7.8, 'Cardio'],
];

describe('Jan Aushadhi matching', () => {
  it('parses ingredients, strengths and pack sizes', () => {
    expect(ingredientsOf('Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg')).toEqual(['amoxicillin', 'clavulanic acid']);
    expect(ingredientsOf('acetaminophen')).toEqual(['paracetamol']);
    expect(strengthsOf('500 mg + 125 mg')).toEqual([500, 125]);
    expect(strengthsOf('Vitamin D3 1 g')).toEqual([1000]);
    expect(unitsOf("10's")).toBe(10);
    expect(unitsOf('60 ml')).toBe(1);
  });

  it('finds the same medicine, strength and form first', () => {
    const [best] = findGenerics({ generic: 'Paracetamol', strength: '650 mg', form: 'tablet' }, LIST);
    expect(best).toMatchObject({ code: '37', exact: true, perUnit: 0.59 });
  });

  it('matches a combination only when every ingredient is present', () => {
    const r = findGenerics({ generic: 'pantoprazole and domperidone', strength: '40 mg + 30 mg', form: 'capsule' }, LIST);
    expect(r[0]!.code).toBe('121');
    expect(r.some((m) => m.code === '120')).toBe(false);
  });

  it('maps US names and spelling variants to the Indian listing', () => {
    expect(findGenerics({ generic: 'amoxicillin / clavulanate', strength: '500 mg + 125 mg', form: 'tablet' }, LIST)[0]!.code).toBe('90');
  });

  it('prefers the right form and returns nothing for unknown drugs', () => {
    expect(findGenerics({ generic: 'paracetamol', strength: '125 mg', form: 'syrup' }, LIST)[0]!.code).toBe('38');
    expect(findGenerics({ generic: 'montelukast', strength: '10 mg', form: 'tablet' }, LIST)).toEqual([]);
  });

  it('searches the list by plain words', () => {
    expect(searchProducts('atorva', LIST).map((m) => m.code)).toEqual(['300']);
  });
});

describe('built-in brand knowledge', async () => {
  const { saltsFor, brandKey } = await import('../src/lib/brands');
  it('maps common brands to salts', () => {
    expect(brandKey('Tab. Pan-D 40')).toBe('pand');
    expect(saltsFor('DOLO 650')).toBe('Paracetamol');
    expect(saltsFor('Montair LC')).toBe('Montelukast + Levocetirizine');
    expect(saltsFor('O2')).toBe('Ofloxacin + Ornidazole');
    expect(saltsFor('O')).toBeNull();
    expect(saltsFor('Unknownbrand')).toBeNull();
  });
  it('finds the generic for a brand with a bare strength', () => {
    const [best] = findGenerics({ generic: saltsFor('Dolo 650')!, strength: 'Dolo 650' }, LIST);
    expect(best?.code).toBe('37');
  });
  it('ignores salt forms', () => {
    expect(ingredientsOf('Metformin Hydrochloride Tablets IP 500 mg')).toEqual(['metformin']);
  });
});
