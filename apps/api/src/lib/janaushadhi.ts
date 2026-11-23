/**
 * Matches a medicine to Jan Aushadhi (PMBJP) generics by ingredients, strength and dosage form.
 * The product list is the official "Product & MRP List" exported from janaushadhi.gov.in and
 * converted by scripts/janaushadhi.mjs into rows of [drugCode, genericName, unitSize, mrp, group].
 */
import products from '../data/janaushadhi.json';

export type Product = [code: string, name: string, unit: string, mrp: number, group: string];
export const PRODUCTS = products as Product[];

/** Indian labels use INN names; US data (RxNorm, openFDA) sometimes uses USAN ones. */
const SYNONYMS: Record<string, string> = {
  acetaminophen: 'paracetamol',
  albuterol: 'salbutamol',
  clavulanate: 'clavulanic acid',
  'clavulanate potassium': 'clavulanic acid',
  'potassium clavulanate': 'clavulanic acid',
  glyburide: 'glibenclamide',
  epinephrine: 'adrenaline',
  rifampin: 'rifampicin',
  furosemide: 'frusemide',
  'vitamin b12': 'methylcobalamin',
  levothyroxine: 'thyroxine',
  cholecalciferol: 'vitamin d',
  guaifenesin: 'guaiphenesin',
  ursodiol: 'ursodeoxycholic acid',
  valproate: 'valproic acid',
  'divalproex': 'valproic acid',
};

/** Salt forms do not change which generic matches: "Metformin Hydrochloride" = "Metformin". */
const SALT_WORDS = /\b(hydrochloride|hcl|sodium|potassium|maleate|besylate|besilate|succinate|tartrate|mesylate|fumarate|citrate|bromide|dihydrate|monohydrate|trihydrate)\b/g;

const FORMS: [RegExp, string][] = [
  [/\b(tab|tabs|tablet|tablets)\b/, 'tablet'],
  [/\b(cap|caps|capsule|capsules)\b/, 'capsule'],
  [/\b(syp|syrup|suspension|solution|oral liquid|drops)\b/, 'liquid'],
  [/\b(inj|injection|vial|ampoule)\b/, 'injection'],
  [/\b(cream|ointment|gel|lotion)\b/, 'topical'],
  [/\b(inhaler|rotacap|respule)\b/, 'inhaled'],
];

export function formOf(text: string): string | null {
  const t = text.toLowerCase();
  for (const [re, form] of FORMS) if (re.test(t)) return form;
  return null;
}

/** Ingredient names from a generic name: "Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg". */
export function ingredientsOf(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(ip|bp|usp|i\.p\.|tablets?|capsules?|syrup|suspension|injection|oral|solution|drops|cream|ointment|gel|gastro-resistant|prolonged|sustained|extended|release|modified|film|coated|dispersible|chewable|sr|er|xr|dr|cr|md|and)\b/g, (m) => (m === 'and' ? ',' : ' '))
    .replace(/[0-9]+(\.[0-9]+)?\s*(mg|mcg|µg|g|ml|iu|%|w\/w|w\/v|units?)\b/g, ' ')
    .replace(/[+/&]/g, ',');
  const names = cleaned.split(',').map((s) => s.replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()).filter((s) => s.length > 2);
  const bare = names.map((n) => (SYNONYMS[n] ? n : n.replace(SALT_WORDS, ' ').replace(/\s+/g, ' ').trim())).filter((n) => n.length > 2);
  return [...new Set(bare.map((n) => SYNONYMS[n] ?? n).map((n) => n.replace(/^amoxycillin$/, 'amoxicillin')))];
}

/** Every strength with its unit, normalised to mg where possible: "500 mg + 125 mg" -> [500, 125]. */
export function strengthsOf(text: string): number[] {
  const out: number[] = [];
  for (const m of text.toLowerCase().matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(mg|mcg|µg|g|iu)\b/g)) {
    const v = Number(m[1]);
    out.push(m[2] === 'g' ? v * 1000 : m[2] === 'mcg' || m[2] === 'µg' ? v / 1000 : v);
  }
  return out;
}

/** Units in a pack: "10's" -> 10, "1x10" -> 10; liquids and tubes count as one pack. */
export function unitsOf(unit: string): number {
  const u = unit.toLowerCase();
  const count = u.match(/([0-9]+)\s*'?s\b/) ?? u.match(/(?:[0-9]+\s*x\s*)?([0-9]+)\s*(?:tab|cap)/);
  return count ? Number(count[1]) : 1;
}

export interface Match {
  code: string;
  name: string;
  unit: string;
  mrp: number;
  group: string;
  perUnit: number | null;
  /** 1 = same ingredients, strength and form. */
  score: number;
  exact: boolean;
  /** What is not the same as the medicine asked about; empty for an exact match. */
  differs?: ('ingredients' | 'strength' | 'form')[];
}

/**
 * Ranks products: all query ingredients must be present (extra ingredients are penalised), then
 * matching strengths and form raise the score. Returns the best few at or above `min`.
 */
export function findGenerics(query: { generic: string; strength?: string | null; form?: string | null }, list: Product[] = PRODUCTS, min = 0.55, limit = 3): Match[] {
  const want = ingredientsOf(query.generic);
  if (!want.length) return [];
  let wantStrength = strengthsOf(`${query.strength ?? ''} ${query.generic}`);
  // "Dolo 650", "Pan 40": a bare number after a brand is a strength in mg.
  if (!wantStrength.length) wantStrength = [...(query.strength ?? '').matchAll(/(?:^|[\s-])([0-9]+(?:\.[0-9]+)?)(?![0-9.]*\s*(?:x|ml|'s|tab|cap))\b/gi)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 2000);
  const wantForm = formOf(`${query.form ?? ''} ${query.generic}`);
  const scored: Match[] = [];
  for (const [code, name, unit, mrp, group] of list) {
    const have = ingredientsOf(name);
    if (!want.every((w) => have.some((h) => h === w || h.startsWith(w) || w.startsWith(h)))) continue;
    const extra = have.length > want.length;
    let score = 0.55 - 0.12 * Math.max(0, have.length - want.length);
    const hs = strengthsOf(name);
    // Same number of strengths and each one present: "10 mg" must not match a 3-salt tablet's 10 mg phenylephrine.
    const strengthOk = wantStrength.length > 0 && hs.length === wantStrength.length && wantStrength.every((s) => hs.some((h) => Math.abs(h - s) < 1e-6));
    if (wantStrength.length && strengthOk) score += 0.3;
    else if (wantStrength.length && hs.length) score -= 0.15;
    const form = formOf(name);
    if (wantForm && form === wantForm) score += 0.15;
    else if (wantForm && form && form !== wantForm) score -= 0.2;
    const differs: Match['differs'] = [];
    if (extra) differs.push('ingredients');
    if (wantStrength.length && !strengthOk) differs.push('strength');
    if (wantForm && form !== wantForm) differs.push('form');
    const units = unitsOf(unit);
    scored.push({ code, name, unit, mrp, group, perUnit: mrp > 0 && units > 1 ? Math.round((mrp / units) * 100) / 100 : null, score: Math.round(score * 100) / 100, exact: score >= 0.99, differs });
  }
  // Combinations with extra salts are not substitutes; show them only when nothing with the same salts exists.
  const same = scored.filter((m) => !m.differs?.includes('ingredients'));
  if (same.some((m) => m.score >= min)) scored.splice(0, scored.length, ...same);
  return scored.filter((m) => m.score >= min && m.mrp > 0).sort((a, b) => b.score - a.score || a.mrp - b.mrp).slice(0, limit);
}

/** Plain text search over the list for the manual search box (no AI). */
export function searchProducts(text: string, list: Product[] = PRODUCTS, limit = 8): Match[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return list
    .filter(([code, name]) => words.every((w) => name.toLowerCase().includes(w) || code === w))
    .slice(0, limit)
    .map(([code, name, unit, mrp, group]) => {
      const units = unitsOf(unit);
      return { code, name, unit, mrp, group, perUnit: mrp > 0 && units > 1 ? Math.round((mrp / units) * 100) / 100 : null, score: 1, exact: false };
    });
}
