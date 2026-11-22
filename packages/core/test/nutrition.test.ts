import { describe, expect, it } from 'vitest';
import { analyseThali, dailyTarget, dishes, mealTotals } from '../src/nutrition';

const kamla = { age: 34, sex: 'female' as const };

describe('mealTotals', () => {
  it('multiplies per-serving values by count exactly', () => {
    const rice = dishes.find((d) => d.id === 'rice')!;
    const { totals } = mealTotals([{ dishId: 'rice', count: 2 }]);
    expect(totals.kcal).toBe(rice.per.kcal * 2);
    expect(totals.protein).toBe(rice.per.protein * 2);
  });

  it('sums several dishes', () => {
    const { totals } = mealTotals([
      { dishId: 'roti', count: 3 },
      { dishId: 'dal_arhar', count: 1 },
    ]);
    const per = (id: string) => dishes.find((d) => d.id === id)!.per.kcal;
    expect(totals.kcal).toBeCloseTo(per('roti') * 3 + per('dal_arhar'), 1);
  });

  it('reports unknown dishes and skips them', () => {
    const r = mealTotals([{ dishId: 'pizza', count: 1 }]);
    expect(r.unknownDishes).toEqual(['pizza']);
    expect(r.totals.kcal).toBe(0);
  });

  it('treats negative counts as zero', () => {
    expect(mealTotals([{ dishId: 'rice', count: -1 }]).totals.kcal).toBe(0);
  });

  it('half portions are allowed', () => {
    const rice = dishes.find((d) => d.id === 'rice')!.per.kcal;
    expect(mealTotals([{ dishId: 'rice', count: 0.5 }]).totals.kcal).toBeCloseTo(rice / 2, 1);
  });
});

describe('dailyTarget', () => {
  it('adds pregnancy extras for pregnant women only', () => {
    const base = dailyTarget(kamla);
    // ICMR-NIN 2020: pregnancy adds energy and protein (iron RDA is slightly lower than for non-pregnant women).
    expect(dailyTarget({ ...kamla, pregnant: true }).kcal).toBe(base.kcal + 350);
    expect(dailyTarget({ ...kamla, pregnant: true }).protein).toBeGreaterThan(base.protein);
    expect(dailyTarget({ age: 30, sex: 'male', pregnant: true })).toEqual(dailyTarget({ age: 30, sex: 'male' }));
  });

  it('children under 4 use the youngest group', () => {
    expect(dailyTarget({ age: 2, sex: 'male' })).toEqual(dailyTarget({ age: 5, sex: 'female' }));
  });

  it('adults use the moderately active row', () => {
    expect(dailyTarget({ age: 30, sex: 'female' }).kcal).toBeGreaterThan(dailyTarget({ age: 30, sex: 'female', pregnant: false }).kcal - 1);
    expect(dailyTarget({ age: 30, sex: 'male' }).kcal).toBeGreaterThan(dailyTarget({ age: 30, sex: 'female' }).kcal);
  });
});

describe('analyseThali', () => {
  it('rice-heavy plate is flagged low iron and refined carb', () => {
    const r = analyseThali([{ dishId: 'rice', count: 3 }, { dishId: 'aloo_sabzi', count: 1 }], kamla);
    expect(r.flags).toEqual(expect.arrayContaining(['low_iron', 'high_refined_carb']));
  });

  it('poha alone is flagged low protein', () => {
    expect(analyseThali([{ dishId: 'poha', count: 1 }], kamla).flags).toContain('low_protein');
  });

  it('balanced local plate clears protein and iron flags', () => {
    const r = analyseThali(
      [
        { dishId: 'kodo_rice', count: 1 },
        { dishId: 'kulthi_dal', count: 1 },
        { dishId: 'lal_bhaji', count: 1 },
        { dishId: 'roti', count: 2 },
        { dishId: 'guava', count: 1 },
      ],
      kamla,
    );
    expect(r.flags).not.toContain('low_protein');
    expect(r.flags).not.toContain('low_iron');
    expect(r.flags).not.toContain('no_vitamin_c');
  });

  it('tea with the meal is flagged', () => {
    expect(analyseThali([{ dishId: 'roti', count: 2 }, { dishId: 'tea_milk', count: 1 }], kamla).flags).toContain('tea_with_meal');
  });

  it('pallor puts iron advice first', () => {
    const r = analyseThali([{ dishId: 'rice', count: 3 }], { ...kamla, pallor: true });
    expect(r.flags[0]).toBe('low_iron');
    expect(r.swaps[0]?.flag).toBe('low_iron');
  });

  it('returns at most 3 unique swaps', () => {
    const r = analyseThali([{ dishId: 'samosa', count: 6 }, { dishId: 'tea_milk', count: 1 }], kamla);
    expect(r.swaps.length).toBeLessThanOrEqual(3);
    expect(new Set(r.swaps.map((s) => s.id)).size).toBe(r.swaps.length);
  });

  it('empty plate has no flags', () => {
    expect(analyseThali([], kamla).flags).toEqual([]);
  });

  it('is deterministic', () => {
    const items = [{ dishId: 'poha', count: 1 }];
    expect(analyseThali(items, kamla)).toEqual(analyseThali(items, kamla));
  });

  it('every catalogue dish has all nutrients', () => {
    for (const d of dishes) {
      expect(Object.keys(d.per).sort()).toEqual(['calcium', 'carbs', 'fat', 'fibre', 'iron', 'kcal', 'protein', 'vitaminC']);
    }
  });
});
