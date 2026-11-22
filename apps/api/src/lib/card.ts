import {
  EyeFlags,
  Hearing,
  Symptoms,
  Vision,
  Vitals,
  triage,
  type TriageInput,
  type TriageResult,
} from '@niktan/core';
import type { Env } from '../env';

export interface SessionRow {
  id: string;
  created_at: number;
  age: number;
  sex: 'female' | 'male' | 'other';
  pregnant: number;
  lang: string;
  simulated: number;
}

export interface CardData {
  session: { id: string; createdAt: number; age: number; sex: string; pregnant: boolean; lang: string; simulated: boolean };
  vitals: Vitals | null;
  eye: EyeFlags | null;
  vision: Vision | null;
  hearing: Hearing | null;
  symptoms: Symptoms | null;
  triage: TriageResult;
}

const parsers = { vitals: Vitals, eye: EyeFlags, vision: Vision, hearing: Hearing, symptoms: Symptoms } as const;

export async function loadCard(env: Env, sessionId: string): Promise<CardData | null> {
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<SessionRow>();
  if (!session) return null;
  const { results } = await env.DB.prepare('SELECT module, data_json FROM measurements WHERE session_id = ?')
    .bind(sessionId)
    .all<{ module: keyof typeof parsers; data_json: string }>();

  const m: { -readonly [K in keyof typeof parsers]?: unknown } = {};
  for (const row of results) {
    const parsed = parsers[row.module]?.safeParse(JSON.parse(row.data_json));
    if (parsed?.success) m[row.module] = parsed.data;
  }
  const symptoms = (m.symptoms as Symptoms | undefined) ?? null;
  const input: TriageInput = {
    age: session.age,
    sex: session.sex,
    pregnant: !!session.pregnant,
    vitals: (m.vitals as Vitals | undefined) ?? null,
    eye: (m.eye as EyeFlags | undefined) ?? null,
    vision: (m.vision as Vision | undefined) ?? null,
    hearing: (m.hearing as Hearing | undefined) ?? null,
    symptoms: symptoms?.symptoms ?? [],
    // Red flags count only once the user has confirmed what we understood.
    redFlags: symptoms?.confirmed ? symptoms.redFlags : {},
    declinedRedFlags: symptoms?.declined ?? [],
  };
  return {
    session: {
      id: session.id,
      createdAt: session.created_at,
      age: session.age,
      sex: session.sex,
      pregnant: !!session.pregnant,
      lang: session.lang,
      simulated: !!session.simulated,
    },
    vitals: input.vitals ?? null,
    eye: input.eye ?? null,
    vision: input.vision ?? null,
    hearing: input.hearing ?? null,
    symptoms,
    triage: triage(input),
  };
}

export async function saveTriage(env: Env, sessionId: string, result: TriageResult) {
  await env.DB.prepare(
    `INSERT INTO triage (session_id, priority, department, reasons_json, rules_version, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(session_id) DO UPDATE SET priority = ?2, department = ?3, reasons_json = ?4, rules_version = ?5, created_at = ?6`,
  )
    .bind(sessionId, result.priority, result.department, JSON.stringify(result.reasons), result.rulesVersion, Date.now())
    .run();
}

/** Staff and QR recipients can view a card without receiving its owner's editing handle. */
export function shareableCard(card: CardData) {
  const { id: _owner, ...session } = card.session;
  return { ...card, session };
}
