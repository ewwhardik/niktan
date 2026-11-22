import catalogue from './data/dishes.json';
import targetTable from './data/targets.json';
import swapTable from './data/swaps.json';

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'iron', 'calcium', 'vitaminC'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];
export type Nutrients = Record<Nutrient, number>;

export type Dish = (typeof catalogue.dishes)[number];
export const dishes: Dish[] = catalogue.dishes;
const dishById = new Map(dishes.map((d) => [d.id, d]));

export interface ThaliItem {
  dishId: string;
  /** Number of servings in the dish's own unit (katori, roti, piece…). */
  count: number;
}

export type ThaliFlag =
  | 'low_protein'
  | 'low_iron'
  | 'no_vitamin_c'
  | 'low_fibre'
  | 'high_refined_carb'
  | 'high_kcal'
  | 'tea_with_meal';

export interface Swap {
  id: string;
  hi: string;
  en: string;
  flag: ThaliFlag;
}

export interface ThaliResult {
  totals: Nutrients;
  /** Meal target = daily target × meal share. */
  mealTarget: Nutrients;
  /** totals / mealTarget, 0..∞ (1 = exactly the meal share). */
  share: Nutrients;
  flags: ThaliFlag[];
  swaps: Swap[];
  unknownDishes: string[];
}

export interface Person {
  age: number;
  sex: 'female' | 'male' | 'other';
  pregnant?: boolean;
  /** Health-card flags that change which advice comes first. */
  pallor?: boolean;
}

const zero = (): Nutrients => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, iron: 0, calcium: 0, vitaminC: 0 });
const round1 = (n: number) => Math.round(n * 10) / 10;

export function dailyTarget(person: Person): Nutrients {
  const age = Math.max(person.age, 4);
  const sex = person.sex === 'other' && age < 18 ? 'female' : person.sex;
  const matches = targetTable.groups.filter((g) => age >= g.ageMin && age <= g.ageMax && (g.sex === 'any' || g.sex === sex));
  // Adults have sedentary and moderate rows; OPD patients are assumed moderately active.
  const group = matches.find((g) => g.id.endsWith('_moderate')) ?? matches[0] ?? targetTable.groups.find((g) => g.id === 'adult_other_moderate')!;
  const target = { ...group.daily };
  if (person.pregnant && person.sex === 'female') {
    for (const [k, v] of Object.entries(targetTable.pregnancyExtra) as [Nutrient, number][]) target[k] += v;
  }
  return target;
}

export function mealTotals(items: ThaliItem[]): { totals: Nutrients; unknownDishes: string[] } {
  const totals = zero();
  const unknownDishes: string[] = [];
  for (const item of items) {
    const dish = dishById.get(item.dishId);
    if (!dish) {
      unknownDishes.push(item.dishId);
      continue;
    }
    const count = Math.max(0, item.count);
    for (const n of NUTRIENTS) totals[n] += dish.per[n] * count;
  }
  for (const n of NUTRIENTS) totals[n] = round1(totals[n]);
  return { totals, unknownDishes };
}

function refinedCarbShare(items: ThaliItem[], totalCarbs: number): number {
  if (totalCarbs <= 0) return 0;
  let refined = 0;
  for (const item of items) {
    const dish = dishById.get(item.dishId);
    if (dish?.tags.includes('refined_carb')) refined += dish.per.carbs * Math.max(0, item.count);
  }
  return refined / totalCarbs;
}

/** Deterministic: same items and person always give the same numbers, flags and advice. */
export function analyseThali(items: ThaliItem[], person: Person): ThaliResult {
  const { totals, unknownDishes } = mealTotals(items);
  const daily = dailyTarget(person);
  const mealTarget = zero();
  const share = zero();
  for (const n of NUTRIENTS) {
    mealTarget[n] = round1(daily[n] * targetTable.mealShare);
    share[n] = mealTarget[n] > 0 ? Math.round((totals[n] / mealTarget[n]) * 100) / 100 : 0;
  }

  const flags: ThaliFlag[] = [];
  const hasFood = totals.kcal > 0;
  if (hasFood) {
    if (share.protein < 0.6) flags.push('low_protein');
    if (share.iron < 0.5) flags.push('low_iron');
    if (share.vitaminC < 0.3) flags.push('no_vitamin_c');
    if (share.fibre < 0.5) flags.push('low_fibre');
    if (refinedCarbShare(items, totals.carbs) > 0.6) flags.push('high_refined_carb');
    if (share.kcal > 1.5) flags.push('high_kcal');
    if (items.some((i) => i.count > 0 && dishById.get(i.dishId)?.tags.includes('iron_blocker'))) flags.push('tea_with_meal');
  }

  // Someone flagged for pallor should see iron advice first, with vitamin C and tea timing right after.
  const order: ThaliFlag[] = person.pallor
    ? ['low_iron', 'no_vitamin_c', 'tea_with_meal', 'low_protein', 'high_refined_carb', 'low_fibre', 'high_kcal']
    : ['low_protein', 'low_iron', 'high_refined_carb', 'high_kcal', 'low_fibre', 'no_vitamin_c', 'tea_with_meal'];
  const sortedFlags = order.filter((f) => flags.includes(f));

  const swaps: Swap[] = [];
  for (const flag of sortedFlags) {
    for (const s of swapTable[flag]) {
      if (!swaps.some((x) => x.id === s.id)) swaps.push({ ...s, flag });
    }
  }
  return { totals, mealTarget, share, flags: sortedFlags, swaps: swaps.slice(0, 3), unknownDishes };
}
