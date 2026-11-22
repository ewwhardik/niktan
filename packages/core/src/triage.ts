import rules from './triage.rules.json';
import symptomList from './symptoms.json';
import type {
  DepartmentId,
  EyeFlags,
  Hearing,
  Priority,
  RedFlag,
  SymptomEntry,
  Vision,
  Vitals,
} from './schemas';

export const RULES_VERSION = rules.version;

export interface TriageInput {
  age: number;
  sex: 'female' | 'male' | 'other';
  pregnant: boolean;
  vitals?: Vitals | null;
  eye?: EyeFlags | null;
  vision?: Vision | null;
  hearing?: Hearing | null;
  symptoms?: SymptomEntry[];
  /** Only confirmed red flags should be passed in. */
  redFlags?: Partial<Record<RedFlag, boolean>>;
  /** Red flags the patient said are not happening now: never an emergency, but seen today. */
  declinedRedFlags?: RedFlag[];
}

export interface Reason {
  code: string;
  hi: string;
  en: string;
}

export interface TriageResult {
  priority: Priority;
  department: DepartmentId;
  reasons: Reason[];
  rulesVersion: string;
}

const RED_FLAG_TEXT: Record<RedFlag, Omit<Reason, 'code'>> = {
  chest_pain: { hi: 'सीने में दर्द', en: 'Chest pain' },
  breathlessness: { hi: 'साँस फूलना', en: 'Breathlessness' },
  unconscious: { hi: 'बेहोशी', en: 'Unconscious / unresponsive' },
  severe_bleeding: { hi: 'बहुत ज़्यादा खून बहना', en: 'Severe bleeding' },
  seizure: { hi: 'दौरा पड़ना', en: 'Seizure' },
  pregnancy_bleeding: { hi: 'गर्भावस्था में रक्तस्राव', en: 'Bleeding in pregnancy' },
  child_lethargic: { hi: 'बच्चा बहुत सुस्त', en: 'Child very drowsy / not feeding' },
};

const symptomByCode = new Map(symptomList.map((s) => [s.code, s]));

function symptomReason(code: string, prefix = 'symptom'): Reason {
  const s = symptomByCode.get(code);
  return { code: `${prefix}:${code}`, hi: s?.hi ?? code, en: s?.en ?? code };
}

/** Vitals below the quality gate are ignored so a noisy reading can never escalate or calm a case. */
function trustedHeartRate(vitals?: Vitals | null): number | null {
  if (!vitals || vitals.quality < rules.qualityMin) return null;
  return vitals.heartRate;
}

export function visionNeedsReferral(vision?: Vision | null): boolean {
  if (!vision) return false;
  const eyes = [vision.leftLogMar, vision.rightLogMar].filter((v): v is number => v !== null);
  if (eyes.some((v) => v > rules.visionReferLogMar)) return true;
  if (eyes.length === 2 && Math.abs(eyes[0]! - eyes[1]!) >= rules.visionAsymmetryLogMar) return true;
  return false;
}

function emergencyReasons(input: TriageInput, hr: number | null): Reason[] {
  const reasons: Reason[] = [];
  const symptoms = input.symptoms ?? [];
  const has = (code: string) => symptoms.some((s) => s.code === code);

  for (const [flag, on] of Object.entries(input.redFlags ?? {}) as [RedFlag, boolean][]) {
    if (on) reasons.push({ code: `red_flag:${flag}`, ...RED_FLAG_TEXT[flag] });
  }
  const declined = new Set<string>(input.declinedRedFlags ?? []);
  for (const code of rules.emergencySymptoms) {
    if (declined.has(code)) continue;
    if (has(code) && !reasons.some((r) => r.code === `red_flag:${code}`)) {
      reasons.push(symptomReason(code, 'red_flag'));
    }
  }
  if (!declined.has('breathlessness') && has('breathlessness') && symptoms.find((s) => s.code === 'breathlessness')?.severity === 'severe') {
    if (!reasons.some((r) => r.code === 'red_flag:breathlessness')) {
      reasons.push({ code: 'red_flag:breathlessness', ...RED_FLAG_TEXT.breathlessness });
    }
  }
  if (hr !== null && hr > rules.heartRate.emergencyAbove) {
    reasons.push({ code: 'hr_very_high', hi: `धड़कन बहुत तेज़ (${Math.round(hr)}/मिनट)`, en: `Very high heart rate (${Math.round(hr)} bpm)` });
  }
  if (hr !== null && hr < rules.heartRate.emergencyBelow) {
    reasons.push({ code: 'hr_very_low', hi: `धड़कन बहुत धीमी (${Math.round(hr)}/मिनट)`, en: `Very low heart rate (${Math.round(hr)} bpm)` });
  }
  if (input.age < rules.childAgeUnder && has('lethargy') && !input.redFlags?.child_lethargic && !declined.has('child_lethargic')) {
    reasons.push({ code: 'red_flag:child_lethargic', ...RED_FLAG_TEXT.child_lethargic });
  }
  if (input.pregnant && has('vaginal_bleeding') && !input.redFlags?.pregnancy_bleeding && !declined.has('pregnancy_bleeding')) {
    reasons.push({ code: 'red_flag:pregnancy_bleeding', ...RED_FLAG_TEXT.pregnancy_bleeding });
  }
  return reasons;
}

function todayReasons(input: TriageInput, hr: number | null): Reason[] {
  const reasons: Reason[] = [];
  const symptoms = input.symptoms ?? [];
  const has = (code: string) => symptoms.some((s) => s.code === code);

  if (hr !== null && hr > rules.heartRate.todayAbove && hr <= rules.heartRate.emergencyAbove) {
    reasons.push({ code: 'hr_high', hi: `धड़कन तेज़ (${Math.round(hr)}/मिनट)`, en: `High heart rate (${Math.round(hr)} bpm)` });
  }
  if (hr !== null && hr < rules.heartRate.todayBelow && hr >= rules.heartRate.emergencyBelow) {
    reasons.push({ code: 'hr_low', hi: `धड़कन धीमी (${Math.round(hr)}/मिनट)`, en: `Low heart rate (${Math.round(hr)} bpm)` });
  }
  const fever = symptoms.find((s) => s.code === 'fever');
  if (fever?.durationDays != null && fever.durationDays >= rules.feverDaysToday) {
    reasons.push({ code: 'fever_long', hi: `${fever.durationDays} दिन से बुखार`, en: `Fever for ${fever.durationDays} days` });
  }
  if (input.eye?.jaundice) {
    reasons.push({ code: 'jaundice_flag', hi: 'आँखों में पीलापन दिखा', en: 'Yellowish eyes seen (jaundice flag)' });
  }
  if (input.eye?.pallor && (has('fatigue') || has('breathlessness') || has('dizziness'))) {
    reasons.push({ code: 'pallor_symptomatic', hi: 'खून की कमी के लक्षण + थकान/साँस फूलना', en: 'Pallor with tiredness or breathlessness' });
  }
  for (const code of rules.todaySymptoms) {
    if (has(code)) reasons.push(symptomReason(code));
  }
  for (const s of symptoms) {
    if (s.severity === 'severe' && !reasons.some((r) => r.code === `symptom:${s.code}`)) {
      const base = symptomReason(s.code);
      reasons.push({ ...base, code: `severe:${s.code}`, hi: `तेज़ ${base.hi}`, en: `Severe ${base.en.toLowerCase()}` });
    }
  }
  for (const flag of input.declinedRedFlags ?? []) {
    reasons.push({ code: `declined:${flag}`, hi: `${RED_FLAG_TEXT[flag].hi} (अभी नहीं)`, en: `${RED_FLAG_TEXT[flag].en} (not right now)` });
  }
  if (input.age >= rules.elderlyAgeFrom && has('breathlessness')) {
    reasons.push({ code: 'elderly_breathless', hi: 'बुज़ुर्ग + साँस फूलना', en: 'Elderly with breathlessness' });
  }
  return reasons;
}

function routineReasons(input: TriageInput): Reason[] {
  const reasons: Reason[] = [];
  if (input.eye?.pallor) reasons.push({ code: 'pallor_flag', hi: 'खून की कमी की जाँच करवाएँ (Hb)', en: 'Pallor seen: get an Hb blood test' });
  if (input.eye?.cataract) reasons.push({ code: 'cataract_flag', hi: 'मोतियाबिंद की जाँच करवाएँ', en: 'Possible cataract: see an eye doctor' });
  if (visionNeedsReferral(input.vision)) reasons.push({ code: 'vision_refer', hi: 'नज़र कमज़ोर: आँख के डॉक्टर को दिखाएँ', en: 'Reduced vision: see an eye doctor' });
  if (input.hearing?.result === 'refer') reasons.push({ code: 'hearing_refer', hi: 'कम सुनाई: ENT को दिखाएँ', en: 'Hearing screen not passed: see ENT' });
  for (const s of input.symptoms ?? []) reasons.push(symptomReason(s.code));
  return reasons;
}

/**
 * Picks a department from the most relevant signal: symptoms first (most severe, then longest),
 * then screening flags. Children always go to paediatrics, pregnancy issues to gynaecology.
 */
export function routeDepartment(input: TriageInput, priority: Priority): DepartmentId {
  if (priority === 'emergency') return 'emergency';
  const symptoms = (input.symptoms ?? []).filter((s) => s.code !== 'other');
  if (input.age < rules.paediatricAgeUnder) return 'paediatrics';
  if (input.pregnant && symptoms.some((s) => ['vaginal_bleeding', 'abdominal_pain', 'missed_period'].includes(s.code))) {
    return 'gynaecology';
  }
  const severityRank = { severe: 2, moderate: 1, mild: 0 } as const;
  const ranked = [...symptoms].sort(
    (a, b) =>
      severityRank[b.severity] - severityRank[a.severity] ||
      (b.durationDays ?? 0) - (a.durationDays ?? 0),
  );
  const top = ranked[0];
  if (top) {
    const dept = symptomByCode.get(top.code)?.department as DepartmentId | undefined;
    if (dept && dept !== 'paediatrics') return dept;
  }
  if (input.eye?.jaundice || input.eye?.pallor) return 'medicine';
  if (input.eye?.cataract || visionNeedsReferral(input.vision)) return 'ophthalmology';
  if (input.hearing?.result === 'refer') return 'ent';
  return 'medicine';
}

export function triage(input: TriageInput): TriageResult {
  const hr = trustedHeartRate(input.vitals);

  const emergency = emergencyReasons(input, hr);
  if (emergency.length > 0) {
    return { priority: 'emergency', department: 'emergency', reasons: emergency, rulesVersion: RULES_VERSION };
  }
  const today = todayReasons(input, hr);
  const priority: Priority = today.length > 0 ? 'today' : 'routine';
  const seen = new Set(today.flatMap((t) => [t.code, t.code.replace(/^severe:/, 'symptom:')]));
  const reasons = [...today, ...routineReasons(input).filter((r) => !seen.has(r.code))];
  return { priority, department: routeDepartment(input, priority), reasons, rulesVersion: RULES_VERSION };
}

export const PRIORITY_ORDER: Record<Priority, number> = { emergency: 0, today: 1, routine: 2 };
