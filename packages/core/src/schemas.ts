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
  creationKey: z.string().regex(/^[a-f0-9]{32}$/).optional(),
});
export type SessionInput = z.infer<typeof SessionInput>;

/** Quality is 0..1; values below QUALITY_MIN are shown but never used for triage. */
export const Vitals = z.object({
  heartRate: z.number().min(20).max(250),
  breathingRate: z.number().min(2).max(60).nullable().default(null),
  quality: z.number().min(0).max(1),
});
export type Vitals = z.infer<typeof Vitals>;

/** Quick yes/no answers asked on the eye step; null when not asked or not answered. */
export const EyeAnswers = z.object({
  yellowEyes: z.boolean().nullable().optional(),
  darkUrine: z.boolean().nullable().optional(),
  cloudyVision: z.boolean().nullable().optional(),
  nightGlare: z.boolean().nullable().optional(),
});
export type EyeAnswers = z.infer<typeof EyeAnswers>;

export const EyeFlags = z.object({
  pallor: z.boolean().nullable().default(null),
  pallorScore: z.number().min(0).max(1).nullable().default(null),
  /** Fused results from `assessJaundice` / `assessCataract` at capture time (true only when "likely"). */
  jaundice: z.boolean().nullable().default(null),
  cataract: z.boolean().nullable().default(null),
  quality: z.number().min(0).max(1),
  /** Sclera CIELAB b* (yellowness), white-balanced against a reference when `scleraReferenced`. */
  scleraB: z.number().min(-40).max(80).nullable().optional(),
  scleraReferenced: z.boolean().optional(),
  /** Whether the two eyes gave similar sclera readings (null when only one eye was usable). */
  eyesAgree: z.boolean().nullable().optional(),
  /** Pupil lightness relative to the sclera, 0 (black pupil) .. 1; grey or white pupils score high. */
  pupilOpacity: z.number().min(0).max(1.5).nullable().optional(),
  answers: EyeAnswers.optional(),
});
export type EyeFlags = z.infer<typeof EyeFlags>;

export const Vision = z.object({
  distanceMm: z.union([z.literal(400), z.literal(2000)]).optional(),
  leftLogMar: z.number().min(-0.3).max(1.3).nullable(),
  rightLogMar: z.number().min(-0.3).max(1.3).nullable(),
  /** Pelli-Robson style log contrast sensitivity, both eyes open. */
  contrastLogCs: z.number().min(0).max(2.5).nullable().optional(),
  /** Red-green plate screen; flag is null when the control plate was missed. */
  colour: z.object({ correct: z.number().int().min(0), total: z.number().int().min(1), controlCorrect: z.boolean(), flag: z.boolean().nullable() }).nullable().optional(),
  /** "Some dial lines look darker or sharper", per eye. */
  astigmatism: z.object({ right: z.boolean().nullable(), left: z.boolean().nullable() }).nullable().optional(),
  /** Contrast sensitivity again with a bright glare ring around the letter (cataract glare disability). */
  glareLogCs: z.number().min(0).max(2.5).nullable().optional(),
});
export type Vision = z.infer<typeof Vision>;

const EarTones = z.record(z.string(), z.number().min(-120).max(0).nullable());

export const Hearing = z.object({
  srtDb: z.number().min(-30).max(30),
  result: z.enum(['pass', 'refer']),
  /** Per-ear tone screen in dBFS (uncalibrated): only between-ear and across-frequency differences are used. */
  tones: z.object({
    right: EarTones,
    left: EarTones,
    falseAlarms: z.number().min(0).max(1),
    reliable: z.boolean(),
    asymmetry: z.boolean().nullable(),
    highDrop: z.boolean().nullable(),
  }).nullable().optional(),
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

/** Experience ratings every reviewing team is asked for (overall is separate and required). */
export const REVIEW_EXPERIENCE = ['ui', 'ux'] as const;
/** Features a team may have tried; only the ticked ones get a rating row. */
export const REVIEW_FEATURES = ['pulse', 'eyes', 'vision', 'hearing', 'symptoms', 'card', 'board', 'thali', 'papers', 'assistant'] as const;
export const REVIEW_SECTIONS = [...REVIEW_EXPERIENCE, ...REVIEW_FEATURES] as const;
export type ReviewSection = (typeof REVIEW_SECTIONS)[number];
export type ReviewFeature = (typeof REVIEW_FEATURES)[number];

/** A team's review from the event: shown publicly on the home page, so no personal details. */
export const Review = z.object({
  team: z.string().trim().min(2).max(60),
  overall: z.number().int().min(1).max(5),
  /** Features the team says they tried, whether or not they rated them. */
  tried: z.array(z.enum(REVIEW_FEATURES)).max(REVIEW_FEATURES.length).default([]),
  /** UI and UX, plus any tried feature the team chose to rate; each 1–5 stars. */
  ratings: z.record(z.enum(REVIEW_SECTIONS), z.number().int().min(1).max(5)).default({}),
  remark: z.string().trim().max(400).default(''),
});
export type Review = z.infer<typeof Review>;
