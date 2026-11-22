import { z } from 'zod';
import symptoms from './symptoms.json';
import departments from './departments.json';

export const SYMPTOM_CODES = symptoms.map((s) => s.code) as [string, ...string[]];
export const DEPARTMENT_IDS = Object.keys(departments) as [DepartmentId, ...DepartmentId[]];
export type DepartmentId = keyof typeof departments;

export const RED_FLAGS = [
  'chest_pain',
  'breathlessness',
  'unconscious',
  'severe_bleeding',
  'seizure',
  'pregnancy_bleeding',
  'child_lethargic',
] as const;
export type RedFlag = (typeof RED_FLAGS)[number];

export const Lang = z.enum(['hi', 'hne', 'en']);
export const Sex = z.enum(['female', 'male', 'other']);
export const Priority = z.enum(['emergency', 'today', 'routine']);
export type Priority = z.infer<typeof Priority>;

export const SessionInput = z.object({
  age: z.number().int().min(0).max(120),
  sex: Sex,
  pregnant: z.boolean().default(false),
  lang: Lang.default('hi'),
});
export type SessionInput = z.infer<typeof SessionInput>;

/** Quality is 0..1; values below QUALITY_MIN are shown but never used for triage. */
export const Vitals = z.object({
  heartRate: z.number().min(20).max(250),
  breathingRate: z.number().min(2).max(60).nullable().default(null),
  quality: z.number().min(0).max(1),
});
export type Vitals = z.infer<typeof Vitals>;

export const EyeFlags = z.object({
  pallor: z.boolean().nullable().default(null),
  pallorScore: z.number().min(0).max(1).nullable().default(null),
  jaundice: z.boolean().nullable().default(null),
  cataract: z.boolean().nullable().default(null),
  quality: z.number().min(0).max(1),
});
export type EyeFlags = z.infer<typeof EyeFlags>;

export const Vision = z.object({
  leftLogMar: z.number().min(-0.3).max(1.3).nullable(),
  rightLogMar: z.number().min(-0.3).max(1.3).nullable(),
});
export type Vision = z.infer<typeof Vision>;

export const Hearing = z.object({
  srtDb: z.number().min(-30).max(30),
  result: z.enum(['pass', 'refer']),
});
export type Hearing = z.infer<typeof Hearing>;

export const SymptomEntry = z.object({
  code: z.enum(SYMPTOM_CODES),
  durationDays: z.number().min(0).max(3650).nullable().default(null),
  severity: z.enum(['mild', 'moderate', 'severe']).default('moderate'),
});
export type SymptomEntry = z.infer<typeof SymptomEntry>;

export const Symptoms = z.object({
  symptoms: z.array(SymptomEntry).max(20),
  redFlags: z.record(z.enum(RED_FLAGS), z.boolean()).default({}),
  summaryHi: z.string().max(500).default(''),
  /** Red flags are acted on only after the user confirms them once. */
  confirmed: z.boolean().default(false),
  /** Red flags the user said are not happening right now; they become see-today reasons. */
  declined: z.array(z.enum(RED_FLAGS)).default([]),
});
export type Symptoms = z.infer<typeof Symptoms>;

export const Measurement = z.discriminatedUnion('module', [
  z.object({ module: z.literal('vitals'), data: Vitals }),
  z.object({ module: z.literal('eye'), data: EyeFlags }),
  z.object({ module: z.literal('vision'), data: Vision }),
  z.object({ module: z.literal('hearing'), data: Hearing }),
  z.object({ module: z.literal('symptoms'), data: Symptoms }),
]);
export type Measurement = z.infer<typeof Measurement>;
export type ModuleName = Measurement['module'];

export const Feedback = z.object({
  sessionId: z.string().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  wouldUse: z.boolean(),
  lastOpdWaitMin: z.number().int().min(0).max(1440).nullable().default(null),
  comment: z.string().max(1000).default(''),
});
export type Feedback = z.infer<typeof Feedback>;
