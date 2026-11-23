import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { analyseThali, dishes, parseSymptoms, RED_FLAGS, SYMPTOM_CODES, type SymptomEntry } from '@niktan/core';
import type { AppEnv } from '../env';
import { AllProvidersFailed, runChain } from '../ai/adapter';
import { SYMPTOM_SYSTEM, THALI_SYSTEM } from '../ai/prompts';
import { asrProviders, llmProviders, visionProviders } from '../ai/providers';
import { requireOwnerHandle } from '../lib/auth';
import { rateLimit } from '../lib/rateLimit';
import { newId, now, parseBody } from '../lib/util';

export const ai = new Hono<AppEnv>();

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

ai.post('/asr', rateLimit('asr', 20, 3600), async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('audio') as unknown;
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'audio file is required' });
  if (file.size > MAX_AUDIO_BYTES) throw new HTTPException(413, { message: 'Recording too long' });
  const language = String(form?.get('language') ?? 'hi').slice(0, 5);
  try {
    const { provider, output } = await runChain(
      c.env,
      'asr',
      asrProviders,
      { audio: await file.arrayBuffer(), mimeType: file.type || 'audio/webm', language },
      (text) => text.length > 0,
    );
    return c.json({ text: output, provider });
  } catch (err) {
    if (err instanceof AllProvidersFailed) return c.json({ text: null, provider: null, fallback: 'web-speech' }, 503);
    throw err;
  }
});

/** Strips anything that looks like a phone or Aadhaar number before text leaves for an AI provider. */
export function redact(text: string): string {
  return text.replace(/(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, '[phone]').replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[id]');
}

const StructureBody = z.object({
  text: z.string().min(1).max(1000),
  age: z.number().int().min(0).max(120).optional(),
  pregnant: z.boolean().optional(),
});

const LlmSymptoms = z.object({
  symptoms: z
    .array(
      z.object({
        code: z.string(),
        durationDays: z.number().nullable().optional(),
        severity: z.enum(['mild', 'moderate', 'severe']).optional(),
      }),
    )
    .max(20),
  redFlags: z.record(z.string(), z.boolean()).optional(),
  summaryHi: z.string().max(500).optional(),
});

ai.post('/symptoms/structure', rateLimit('symptoms', 40, 3600), async (c) => {
  const body = await parseBody(c, StructureBody);
  const text = redact(body.text);
  const local = parseSymptoms(text, { age: body.age, pregnant: body.pregnant });
  try {
    const { provider, output } = await runChain(c.env, 'llm', llmProviders, { system: SYMPTOM_SYSTEM, user: text }, (o) =>
      LlmSymptoms.safeParse(o).success,
    );
    const parsed = LlmSymptoms.parse(output);
    const valid = new Set<string>(SYMPTOM_CODES);
    const symptoms: SymptomEntry[] = parsed.symptoms
      .filter((s) => valid.has(s.code))
      .map((s) => ({ code: s.code, durationDays: s.durationDays ?? null, severity: s.severity ?? 'moderate' }));
    // Red flags are a union of the model's and the rule parser's: missing one is worse than asking once.
    const redFlags: Record<string, boolean> = { ...local.redFlags };
    for (const f of RED_FLAGS) if (parsed.redFlags?.[f]) redFlags[f] = true;
    for (const s of local.symptoms) if (!symptoms.some((x) => x.code === s.code)) symptoms.push(s);
    return c.json({ symptoms, redFlags, summaryHi: parsed.summaryHi ?? '', source: provider });
  } catch (err) {
    if (!(err instanceof AllProvidersFailed)) throw err;
    return c.json({ ...local, summaryHi: '', source: 'offline-rules' });
  }
});

const known = new Set(dishes.map((d) => d.id));
const byName = new Map<string, string>();
for (const d of dishes) for (const n of [d.en, d.hi, d.id.replace(/_/g, ' '), ...d.aliases]) byName.set(n.toLowerCase().trim(), d.id);

/** A catalogue id, or the dish whose name or local name matches the model's label ("Rosogolla" -> rasgulla). */
export function dishFor(id: string, label?: string | null): string {
  if (known.has(id)) return id;
  const key = (label ?? id).toLowerCase().replace(/_/g, ' ').trim();
  return byName.get(key) ?? byName.get(key.replace(/s$/, '')) ?? 'other';
}

const ThaliItems = z.object({
  items: z.array(z.object({ dishId: z.string(), label: z.string().optional(), count: z.number(), confidence: z.number().optional() })).max(20),
  noFood: z.boolean().optional(),
});

ai.post('/thali/recognize', rateLimit('thali', 15, 3600), async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('photo') as unknown;
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'photo is required' });
  if (file.size > MAX_IMAGE_BYTES) throw new HTTPException(413, { message: 'Photo too large' });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HTTPException(415, { message: 'Use a JPEG, PNG or WebP photo' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  try {
    const { provider, output } = await runChain(
      c.env,
      'vision',
      visionProviders,
      { system: THALI_SYSTEM, user: 'Identify the dishes on this plate.', imageBase64: btoa(binary), mimeType: file.type },
      (o) => ThaliItems.safeParse(o).success,
    );
    const parsed = ThaliItems.parse(output);
    const items = parsed.items
      .map((i) => ({
        dishId: dishFor(i.dishId, i.label),
        label: i.label ?? null,
        count: Math.min(10, Math.round(i.count * 2) / 2),
        confidence: Math.max(0, Math.min(1, i.confidence ?? 0.5)),
      }))
      .filter((item) => item.count > 0);
    return c.json({ items, noFood: parsed.noFood ?? items.length === 0, provider });
  } catch (err) {
    if (err instanceof AllProvidersFailed) return c.json({ items: [], noFood: false, provider: null, fallback: 'manual' }, 503);
    throw err;
  }
});

const ComputeBody = z.object({
  sessionId: z.string().max(64).optional(),
  person: z.object({
    age: z.number().int().min(0).max(120),
    sex: z.enum(['female', 'male', 'other']),
    pregnant: z.boolean().optional(),
    pallor: z.boolean().optional(),
  }),
  items: z.array(z.object({ dishId: z.string().max(40), count: z.number().min(0).max(10) })).max(20),
});

ai.post('/thali/compute', async (c) => {
  const body = await parseBody(c, ComputeBody);
  const result = analyseThali(body.items, body.person);
  if (body.sessionId) {
    requireOwnerHandle(body.sessionId);
    await c.env.DB.prepare('INSERT INTO thali_scans (id, session_id, items_json, totals_json, flags_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(newId('th'), body.sessionId, JSON.stringify(body.items), JSON.stringify(result.totals), JSON.stringify(result.flags), now())
      .run()
      .catch(() => undefined);
  }
  return c.json(result);
});
