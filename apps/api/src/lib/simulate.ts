import { triage, type SymptomEntry, type TriageInput } from '@niktan/core';

/** Small seeded PRNG so a demo scenario is reproducible. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMPLAINTS: { symptoms: SymptomEntry[]; weight: number }[] = [
  { weight: 18, symptoms: [{ code: 'fever', durationDays: 2, severity: 'moderate' }, { code: 'cough', durationDays: 2, severity: 'mild' }] },
  { weight: 10, symptoms: [{ code: 'fever', durationDays: 5, severity: 'moderate' }] },
  { weight: 10, symptoms: [{ code: 'joint_pain', durationDays: 60, severity: 'moderate' }] },
  { weight: 8, symptoms: [{ code: 'back_pain', durationDays: 20, severity: 'moderate' }] },
  { weight: 8, symptoms: [{ code: 'fatigue', durationDays: 30, severity: 'moderate' }, { code: 'dizziness', durationDays: 10, severity: 'mild' }] },
  { weight: 7, symptoms: [{ code: 'abdominal_pain', durationDays: 3, severity: 'moderate' }] },
  { weight: 6, symptoms: [{ code: 'skin_rash', durationDays: 14, severity: 'mild' }] },
  { weight: 6, symptoms: [{ code: 'blurred_vision', durationDays: 180, severity: 'moderate' }] },
  { weight: 5, symptoms: [{ code: 'ear_pain', durationDays: 4, severity: 'moderate' }] },
  { weight: 5, symptoms: [{ code: 'headache', durationDays: 7, severity: 'moderate' }] },
  { weight: 4, symptoms: [{ code: 'toothache', durationDays: 5, severity: 'severe' }] },
  { weight: 4, symptoms: [{ code: 'excess_thirst', durationDays: 60, severity: 'moderate' }] },
  { weight: 4, symptoms: [{ code: 'breathlessness', durationDays: 3, severity: 'moderate' }] },
  { weight: 3, symptoms: [{ code: 'diarrhoea', durationDays: 2, severity: 'moderate' }, { code: 'vomiting', durationDays: 1, severity: 'mild' }] },
  { weight: 2, symptoms: [{ code: 'chest_pain', durationDays: 0, severity: 'severe' }] },
];

export interface SimPatient {
  input: TriageInput;
  result: ReturnType<typeof triage>;
}

export function simulatePatient(rand: () => number, forceEmergency = false): SimPatient {
  const age = Math.round(rand() < 0.15 ? 1 + rand() * 12 : 18 + rand() * 62);
  const sex = rand() < 0.52 ? 'female' : 'male';
  let complaint = COMPLAINTS[COMPLAINTS.length - 1]!.symptoms;
  if (!forceEmergency) {
    const pool = COMPLAINTS.slice(0, -1);
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let r = rand() * total;
    for (const c of pool) {
      r -= c.weight;
      if (r <= 0) {
        complaint = c.symptoms;
        break;
      }
    }
  }
  const hr = Math.round(forceEmergency ? 118 + rand() * 20 : 64 + rand() * 40);
  const input: TriageInput = {
    age,
    sex,
    pregnant: false,
    vitals: { heartRate: hr, breathingRate: null, quality: 0.6 + rand() * 0.35 },
    eye: { pallor: rand() < 0.22, pallorScore: null, jaundice: rand() < 0.03, cataract: age > 55 && rand() < 0.2, quality: 0.8 },
    symptoms: complaint,
    redFlags: forceEmergency ? { chest_pain: true } : {},
  };
  return { input, result: triage(input) };
}
