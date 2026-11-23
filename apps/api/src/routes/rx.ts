import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { AllProvidersFailed, runChain } from '../ai/adapter';
import { visionProviders } from '../ai/providers';
import { rateLimit } from '../lib/rateLimit';

export const rx = new Hono<AppEnv>();

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export const RX_SYSTEM = `You read photos of Indian doctors' prescriptions, which are often handwritten, for a patient who needs to understand them. Return only JSON:
{"notPrescription": boolean, "medicines": [{"name": string, "alternatives": string[], "generic": string|null, "strength": string|null, "form": string|null, "dose": string|null, "frequency": string|null, "timing": string|null, "duration": string|null, "confidence": number, "unclear": boolean}], "advice": string[]}
Rules:
- name: exactly as written (brand or generic), corrected only for obvious spelling. generic: the active ingredient(s) in English INN if you are confident (e.g. "Dolo 650" -> "paracetamol", "Augmentin 625" -> "amoxicillin and clavulanic acid"), else null.
- Expand Indian prescription shorthand into plain English in frequency/timing: OD once a day, BD twice a day, TDS/TID three times a day, QID four times a day, HS at bedtime, SOS only when needed, AC before food, PC after food, 1-0-1 morning and night, 1-1-1 morning, afternoon and night, 0-0-1 night. Keep the pattern too, e.g. "1-0-1 (morning and night)".
- dose: amount per intake if written (e.g. "1 tablet", "5 ml"). duration: e.g. "5 days".
- Never invent a medicine, strength or schedule. If a word is hard to read, give your best reading, set unclear true, confidence below 0.6, and list up to two other plausible readings in "alternatives".
- advice: non-medicine instructions written by the doctor (tests, diet, review date), in plain English.
- If the photo is not a prescription, set notPrescription true and medicines [].`;

const Medicine = z.object({
  name: z.string().min(1).max(80),
  alternatives: z.array(z.string().max(80)).max(3).optional(),
  generic: z.string().max(120).nullable().optional(),
  strength: z.string().max(40).nullable().optional(),
  form: z.string().max(40).nullable().optional(),
  dose: z.string().max(60).nullable().optional(),
  frequency: z.string().max(120).nullable().optional(),
  timing: z.string().max(80).nullable().optional(),
  duration: z.string().max(60).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  unclear: z.boolean().optional(),
});
const Reading = z.object({ notPrescription: z.boolean().optional(), medicines: z.array(Medicine).max(25), advice: z.array(z.string().max(240)).max(12).optional() });

type Med = z.infer<typeof Medicine>;
type Read = z.infer<typeof Reading>;

/** Lower-case letters only, without dosage-form prefixes, for comparing two readings of a name. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/^(tab|tablet|cap|capsule|syp|syrup|inj|injection|oint|drops?|susp)\.?\s+/, '').replace(/[^a-z]/g, '');
}

/** 1 - normalised edit distance; 1 means identical. */
export function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return 1 - d[a.length]![b.length]! / Math.max(a.length, b.length);
}

export interface MergedMed extends Med {
  confidence: number;
  unclear: boolean;
  /** true: both readers agree; false: only one reader saw it or they disagree; null: one reader only. */
  agreed: boolean | null;
  alternatives: string[];
}

/**
 * Combines two independent readings. A medicine both readers found (same name within 70 % or the
 * same generic) is confirmed; one found by only one reader, or read differently, is marked to check,
 * with the other reading offered as an alternative.
 */
export function mergeReadings(primary: Read, second: Read | null): { medicines: MergedMed[]; advice: string[] } {
  const base = (m: Med): MergedMed => ({ ...m, confidence: m.confidence ?? 0.5, unclear: m.unclear ?? (m.confidence ?? 0.5) < 0.6, agreed: second ? false : null, alternatives: m.alternatives ?? [] });
  const medicines = primary.medicines.map(base);
  if (!second) return { medicines, advice: primary.advice ?? [] };
  const used = new Set<number>();
  for (const m of medicines) {
    let best = -1;
    let score = 0;
    second.medicines.forEach((o, i) => {
      if (used.has(i)) return;
      const sameGeneric = !!m.generic && !!o.generic && nameKey(m.generic) === nameKey(o.generic);
      const sim = Math.max(similarity(nameKey(m.name), nameKey(o.name)), sameGeneric ? 0.9 : 0);
      if (sim > score) { score = sim; best = i; }
    });
    if (best < 0 || score < 0.7) {
      m.unclear = true;
      m.confidence = Math.min(m.confidence, 0.5);
      continue;
    }
    used.add(best);
    const o = second.medicines[best]!;
    const sameName = nameKey(m.name) === nameKey(o.name);
    // Same ingredient but a different brand reading still needs a human look at the name.
    m.agreed = sameName || (score >= 0.9 && similarity(nameKey(m.name), nameKey(o.name)) >= 0.85);
    if (!sameName) m.alternatives = [...new Set([o.name, ...m.alternatives])].slice(0, 3);
    if (m.agreed) {
      m.confidence = Math.max(m.confidence, o.confidence ?? 0.5);
      m.unclear = !!m.unclear && !!o.unclear;
    } else {
      m.unclear = true;
    }
    // Fill gaps the first reader left from the second reading.
    for (const k of ['generic', 'strength', 'form', 'dose', 'frequency', 'timing', 'duration'] as const) if (!m[k] && o[k]) m[k] = o[k];
  }
  second.medicines.forEach((o, i) => {
    if (!used.has(i)) medicines.push({ ...base(o), agreed: false, unclear: true, confidence: Math.min(o.confidence ?? 0.5, 0.5) });
  });
  const advice = [...(primary.advice ?? [])];
  const same = (x: string, y: string) => {
    const [p, q] = [x.toLowerCase().trim(), y.toLowerCase().trim()];
    return p.includes(q) || q.includes(p) || similarity(p, q) > 0.6;
  };
  for (const a of second.advice ?? []) if (!advice.some((b) => same(a, b))) advice.push(a);
  return { medicines, advice };
}

/**
 * Checks each ingredient against RxNorm. A misspelt ingredient is replaced with RxNorm's spelling
 * suggestion when it is close; one RxNorm has never heard of marks the medicine to check.
 */
async function verifyGeneric(m: MergedMed): Promise<MergedMed & { verified: boolean | null }> {
  if (!m.generic) return { ...m, verified: null };
  const parts = m.generic.split(/\s*(?:,|\+|\band\b|\/)\s*/i).map((p) => p.trim()).filter(Boolean).slice(0, 4);
  const fixed: string[] = [];
  let ok = true;
  for (const part of parts) {
    const approx = await getJson<{ approximateGroup?: { candidate?: { score: string; name?: string }[] } }>(
      `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(part)}&maxEntries=1`,
    );
    const score = Number(approx?.approximateGroup?.candidate?.[0]?.score ?? 0);
    if (score >= 8) { fixed.push(part); continue; }
    const spell = await getJson<{ suggestionGroup?: { suggestionList?: { suggestion?: string[] } } }>(
      `https://rxnav.nlm.nih.gov/REST/spellingsuggestions.json?name=${encodeURIComponent(part)}`,
    );
    const suggestion = spell?.suggestionGroup?.suggestionList?.suggestion?.[0];
    if (suggestion && similarity(part.toLowerCase(), suggestion.toLowerCase()) >= 0.7) fixed.push(suggestion.toLowerCase());
    else if (score >= 4) fixed.push(part);
    else { fixed.push(part); ok = false; }
  }
  const generic = fixed.join(' and ');
  return { ...m, generic, verified: ok, unclear: m.unclear || !ok };
}

/**
 * Reads a prescription photo twice, with two different vision models in parallel, and merges the
 * readings. The image goes to the providers and is not stored.
 */
rx.post('/rx/read', rateLimit('rx', 12, 3600), async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('photo') as unknown;
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'photo is required' });
  if (file.size > MAX_IMAGE_BYTES) throw new HTTPException(413, { message: 'Photo too large' });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HTTPException(415, { message: 'Use a JPEG, PNG or WebP photo' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const input = { system: RX_SYSTEM, user: 'Read every medicine and instruction on this prescription.', imageBase64: btoa(binary), mimeType: file.type };
  const valid = (o: unknown) => Reading.safeParse(o).success;
  // The second reader prefers the providers the first tries last, so the two readings are independent.
  const ordered = visionProviders.filter((p) => p.available(c.env));
  const [first, second] = await Promise.allSettled([
    runChain(c.env, 'vision', ordered, input, valid),
    runChain(c.env, 'vision', [...ordered].reverse(), input, valid),
  ]);
  const a = first.status === 'fulfilled' ? first.value : null;
  const b = second.status === 'fulfilled' ? second.value : null;
  const primary = a ?? b;
  if (!primary) return c.json({ medicines: [], advice: [], provider: null, fallback: true }, 503);
  const other = a && b && a.provider !== b.provider ? b : null;
  const readA = Reading.parse(primary.output);
  const merged = mergeReadings(readA, other ? Reading.parse(other.output) : null);
  const medicines = await Promise.all(merged.medicines.map(verifyGeneric));
  return c.json({
    notPrescription: (readA.notPrescription ?? false) && medicines.length === 0,
    medicines,
    advice: merged.advice,
    provider: primary.provider,
    secondReader: other?.provider ?? null,
  });
});

interface Label {
  purpose?: string[];
  indications_and_usage?: string[];
  warnings?: string[];
  warnings_and_cautions?: string[];
  boxed_warning?: string[];
  do_not_use?: string[];
  adverse_reactions?: string[];
  openfda?: { brand_name?: string[]; generic_name?: string[] };
}

/** First sentences of a label section, without its heading ("1 INDICATIONS AND USAGE", "Uses"). */
function excerpt(section: string[] | undefined, max = 420): string | null {
  const text = section?.[0]?.replace(/^\s*[\d.]*\s*[A-Z][A-Z &/,-]{3,}\s+/, '').replace(/^(Uses|Purpose|Warnings)\s+/i, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf('. ') + 1, cut.lastIndexOf(' ')))}…`;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cf: { cacheTtl: 86_400, cacheEverything: true } } as RequestInit).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
}

/**
 * Public reference information for one medicine: RxNorm (US National Library of Medicine) maps
 * Indian and international names to an ingredient; the FDA label supplies uses and warnings.
 */
rx.get('/rx/info', rateLimit('rxinfo', 120, 3600), async (c) => {
  const name = (c.req.query('name') ?? '').trim().slice(0, 120);
  if (name.length < 2) throw new HTTPException(400, { message: 'name is required' });
  const approx = await getJson<{ approximateGroup?: { candidate?: { rxcui: string }[] } }>(
    `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(name)}&maxEntries=1`,
  );
  const rxcui = approx?.approximateGroup?.candidate?.[0]?.rxcui ?? null;
  let ingredient: string | null = null;
  if (rxcui) {
    const props = await getJson<{ properties?: { name: string; tty: string } }>(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`);
    if (props?.properties && ['IN', 'MIN', 'PIN'].includes(props.properties.tty)) {
      ingredient = props.properties.name;
    } else {
      // A brand or product: take its ingredients (IN), not a related combination product.
      const related = await getJson<{ relatedGroup?: { conceptGroup?: { tty: string; conceptProperties?: { name: string }[] }[] } }>(
        `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=IN`,
      );
      const names = related?.relatedGroup?.conceptGroup?.find((g) => g.tty === 'IN')?.conceptProperties?.map((p) => p.name) ?? [];
      ingredient = names.length ? names.join(' / ') : null;
    }
  }
  // FDA labels name combinations "x and y"; try the full ingredient, then the first one, then the name as written.
  const parts = (ingredient ?? '').split(' / ').filter(Boolean);
  const tries = [...new Set([parts.join(' and '), parts[0], name].filter((v): v is string => !!v).map((v) => v.toLowerCase()))];
  let fda: { results?: Label[] } | null = null;
  for (const term of tries) {
    fda = await getJson<{ results?: Label[] }>(`https://api.fda.gov/drug/label.json?search=openfda.generic_name:${encodeURIComponent(`"${term}"`)}&limit=1`)
      ?? await getJson<{ results?: Label[] }>(`https://api.fda.gov/drug/label.json?search=openfda.brand_name:${encodeURIComponent(`"${term}"`)}&limit=1`);
    if (fda?.results?.length) break;
  }
  const label = fda?.results?.[0];
  c.header('Cache-Control', 'public, max-age=86400');
  return c.json({
    query: name,
    ingredient,
    rxcui,
    found: !!label,
    uses: excerpt(label?.indications_and_usage ?? label?.purpose),
    warnings: excerpt(label?.boxed_warning ?? label?.warnings ?? label?.warnings_and_cautions),
    doNotUse: excerpt(label?.do_not_use, 260),
    sideEffects: excerpt(label?.adverse_reactions, 300),
    sources: [
      rxcui ? { name: 'RxNorm (NLM)', url: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${rxcui}` } : null,
      label ? { name: 'openFDA drug label', url: `https://open.fda.gov/apis/drug/label/` } : null,
    ].filter(Boolean),
  });
});
