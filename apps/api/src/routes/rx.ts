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
{"notPrescription": boolean, "medicines": [{"name": string, "generic": string|null, "strength": string|null, "form": string|null, "dose": string|null, "frequency": string|null, "timing": string|null, "duration": string|null, "confidence": number, "unclear": boolean}], "advice": string[]}
Rules:
- name: exactly as written (brand or generic), corrected only for obvious spelling. generic: the active ingredient(s) in English INN if you are confident (e.g. "Dolo 650" -> "paracetamol", "Augmentin 625" -> "amoxicillin and clavulanic acid"), else null.
- Expand Indian prescription shorthand into plain English in frequency/timing: OD once a day, BD twice a day, TDS/TID three times a day, QID four times a day, HS at bedtime, SOS only when needed, AC before food, PC after food, 1-0-1 morning and night, 1-1-1 morning, afternoon and night, 0-0-1 night. Keep the pattern too, e.g. "1-0-1 (morning and night)".
- dose: amount per intake if written (e.g. "1 tablet", "5 ml"). duration: e.g. "5 days".
- Never invent a medicine, strength or schedule. If a word is hard to read, give your best reading, set unclear true and confidence below 0.6.
- advice: non-medicine instructions written by the doctor (tests, diet, review date), in plain English.
- If the photo is not a prescription, set notPrescription true and medicines [].`;

const Medicine = z.object({
  name: z.string().min(1).max(80),
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

/** Reads a prescription photo. The image goes to the vision provider and is not stored. */
rx.post('/rx/read', rateLimit('rx', 12, 3600), async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('photo') as unknown;
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'photo is required' });
  if (file.size > MAX_IMAGE_BYTES) throw new HTTPException(413, { message: 'Photo too large' });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HTTPException(415, { message: 'Use a JPEG, PNG or WebP photo' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  try {
    const { provider, output } = await runChain(c.env, 'vision', visionProviders,
      { system: RX_SYSTEM, user: 'Read every medicine and instruction on this prescription.', imageBase64: btoa(binary), mimeType: file.type },
      (o) => Reading.safeParse(o).success);
    const reading = Reading.parse(output);
    return c.json({
      notPrescription: reading.notPrescription ?? false,
      medicines: reading.medicines.map((m) => ({ ...m, confidence: m.confidence ?? 0.5, unclear: m.unclear ?? (m.confidence ?? 0.5) < 0.6 })),
      advice: reading.advice ?? [],
      provider,
    });
  } catch (err) {
    if (err instanceof AllProvidersFailed) return c.json({ medicines: [], advice: [], provider: null, fallback: true }, 503);
    throw err;
  }
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
