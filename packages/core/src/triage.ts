import rules from './triage.rules.json';
import { assessCataract, assessJaundice, EYE_RULES } from './eyeRisk';
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
  /** Checks that were skipped or failed the quality gate, phrased as what staff should do instead. */
  gaps: Reason[];
  /** 0-100 ordering hint inside a priority tier; tiers never overlap (emergency 80+, today 40-79, routine 0-39). */
  acuity: number;
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

/** Normal resting pulse falls with age, so limits come from the patient's age band. */
export function heartRateBand(age: number) {
  return rules.heartRateBands.find((b) => age >= b.ageMin && age <= b.ageMax) ?? rules.heartRateBands[rules.heartRateBands.length - 1]!;
}

export function visionNeedsReferral(vision?: Vision | null): boolean {
  if (!vision) return false;
  const eyes = [vision.leftLogMar, vision.rightLogMar].filter((v): v is number => v !== null);
  if (eyes.some((v) => v > rules.visionReferLogMar)) return true;
  if (eyes.length === 2 && Math.abs(eyes[0]! - eyes[1]!) + Number.EPSILON >= rules.visionAsymmetryLogMar) return true;
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
  if (hr !== null && hr > heartRateBand(input.age).emergencyAbove) {
    reasons.push({ code: 'hr_very_high', hi: `धड़कन बहुत तेज़ (${Math.round(hr)}/मिनट)`, en: `Very high heart rate (${Math.round(hr)} bpm)` });
  }
  if (hr !== null && hr < heartRateBand(input.age).emergencyBelow) {
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

  if (hr !== null && hr > heartRateBand(input.age).todayAbove && hr <= heartRateBand(input.age).emergencyAbove) {
    reasons.push({ code: 'hr_high', hi: `धड़कन तेज़ (${Math.round(hr)}/मिनट)`, en: `High heart rate (${Math.round(hr)} bpm)` });
  }
  if (hr !== null && hr < heartRateBand(input.age).todayBelow && hr >= heartRateBand(input.age).emergencyBelow) {
    reasons.push({ code: 'hr_low', hi: `धड़कन धीमी (${Math.round(hr)}/मिनट)`, en: `Low heart rate (${Math.round(hr)} bpm)` });
  }
  const fever = symptoms.find((s) => s.code === 'fever');
  if (fever?.durationDays != null && fever.durationDays >= rules.feverDaysToday) {
    reasons.push({ code: 'fever_long', hi: `${fever.durationDays} दिन से बुखार`, en: `Fever for ${fever.durationDays} days` });
  }
  if (assessJaundice(input.eye).level === 'likely') {
    reasons.push({ code: 'jaundice_flag', hi: 'पीलिया के संकेत (आँखों का पीलापन या लक्षण): बिलीरुबिन जाँच करवाएँ', en: 'Signs of jaundice (yellow eyes or symptoms): get a bilirubin test' });
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

/** Contrast, colour and astigmatism findings: each is a reason to see an eye doctor, never urgent. */
export function visionExtraReasons(vision?: Vision | null): Reason[] {
  const reasons: Reason[] = [];
  if (vision?.contrastLogCs != null && vision.contrastLogCs < rules.contrastReducedBelowLogCs) {
    reasons.push({ code: 'contrast_low', hi: 'कम कॉन्ट्रास्ट दिखना: आँख के डॉक्टर को दिखाएँ', en: 'Reduced contrast sensitivity: see an eye doctor' });
  }
  if (vision?.colour?.flag) {
    reasons.push({ code: 'colour_red_green', hi: 'लाल-हरे रंग पहचानने में अंतर हो सकता है: आँख के डॉक्टर से पुष्टि करें', en: 'Possible red-green colour vision difference: confirm with an eye doctor' });
  }
  if (vision?.contrastLogCs != null && vision.glareLogCs != null && vision.contrastLogCs - vision.glareLogCs >= EYE_RULES.cataract.glareLossLogCs - 1e-9) {
    reasons.push({ code: 'glare_loss', hi: 'तेज़ रोशनी (चकाचौंध) में कॉन्ट्रास्ट बहुत घटा: मोतियाबिंद का संकेत हो सकता है, आँख के डॉक्टर को दिखाएँ', en: 'Contrast dropped a lot under glare, a possible cataract sign: see an eye doctor' });
  }
  if (vision?.astigmatism?.right || vision?.astigmatism?.left) {
    reasons.push({ code: 'astigmatism_flag', hi: 'डायल की कुछ रेखाएँ गहरी दिखीं: संभावित एस्टिग्मैटिज़्म, आँख की जाँच करवाएँ', en: 'Some dial lines looked darker: possible astigmatism, arrange an eye test' });
  }
  return reasons;
}

function routineReasons(input: TriageInput): Reason[] {
  const reasons: Reason[] = [];
  if (input.eye?.pallor) reasons.push({ code: 'pallor_flag', hi: 'खून की कमी की जाँच करवाएँ (Hb)', en: 'Pallor seen: get an Hb blood test' });
  const jaundice = assessJaundice(input.eye).level;
  if (jaundice === 'possible') reasons.push({ code: 'jaundice_possible', hi: 'आँखों में हल्का पीलापन या पीलिया के लक्षण: दिन की रोशनी में फिर जाँचें, पेशाब गहरा हो तो डॉक्टर को दिखाएँ', en: 'Slight yellow tint or a jaundice symptom: recheck in daylight, see a doctor if urine is dark' });
  const cataract = assessCataract(input.eye, input.age, input.vision).level;
  if (cataract === 'likely') reasons.push({ code: 'cataract_flag', hi: 'मोतियाबिंद के संकेत: आँख के डॉक्टर से जाँच करवाएँ', en: 'Signs of cataract: see an eye doctor' });
  if (cataract === 'possible') reasons.push({ code: 'cataract_possible', hi: 'मोतियाबिंद के कुछ संकेत: आँख की जाँच करवाएँ', en: 'Some cataract signs: arrange an eye check' });
  if (visionNeedsReferral(input.vision)) reasons.push(input.vision?.distanceMm === 400
    ? { code: 'vision_refer', hi: 'पास की नज़र की जाँच करवाएँ', en: 'Arrange a near-vision check' }
    : { code: 'vision_refer', hi: 'नज़र कमज़ोर: आँख के डॉक्टर को दिखाएँ', en: 'Reduced vision: see an eye doctor' });
  reasons.push(...visionExtraReasons(input.vision));
  if (input.hearing?.tones?.asymmetry) reasons.push({ code: 'hearing_asymmetry', hi: 'दोनों कानों में सुनने में अंतर: सुनने की जाँच करवाएँ', en: 'The two ears heard tones differently: arrange a hearing check' });
  if (input.hearing?.tones?.highDrop) reasons.push({ code: 'hearing_high_drop', hi: 'ऊँची आवाज़ (4 kHz) कम सुनाई दी: सुनने की जाँच करवाएँ', en: 'High-pitched tones were harder to hear: arrange a hearing check' });
  if (input.hearing?.result === 'refer') reasons.push({ code: 'hearing_refer', hi: 'प्रायोगिक श्रवण जाँच: ENT से पुष्टि करवाएँ', en: 'Experimental hearing screen: arrange a hearing check' });
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
  if (assessJaundice(input.eye).level === 'likely' || input.eye?.pallor) return 'medicine';
  const cataract = assessCataract(input.eye, input.age, input.vision).level;
  if (cataract === 'likely' || cataract === 'possible' || visionNeedsReferral(input.vision) || visionExtraReasons(input.vision).length) return 'ophthalmology';
  if (input.hearing?.result === 'refer' || input.hearing?.tones?.asymmetry || input.hearing?.tones?.highDrop) return 'ent';
  return 'medicine';
}

/** What the screening could not establish, so the desk can measure it by hand. */
export function coverageGaps(input: TriageInput): Reason[] {
  const gaps: Reason[] = [];
  if (!input.vitals) gaps.push({ code: 'gap:vitals', hi: 'नब्ज़ नहीं नापी गई: डेस्क पर नब्ज़ देखें', en: 'Heart rate not measured: take pulse at the desk' });
  else if (input.vitals.quality < rules.qualityMin) gaps.push({ code: 'gap:vitals_quality', hi: 'नब्ज़ की रीडिंग साफ़ नहीं: डेस्क पर नब्ज़ देखें', en: 'Heart-rate signal unclear: take pulse at the desk' });
  if (!input.eye) gaps.push({ code: 'gap:eye', hi: 'आँख की जाँच नहीं हुई', en: 'Eye check not done' });
  if (!input.vision) gaps.push({ code: 'gap:vision', hi: 'नज़र की जाँच नहीं हुई', en: 'Vision test not done' });
  if (!input.hearing) gaps.push({ code: 'gap:hearing', hi: 'सुनने की जाँच पूरी नहीं', en: 'Hearing test not completed' });
  return gaps;
}

const TIER: Record<Priority, [number, number]> = { emergency: [80, 100], today: [40, 79], routine: [0, 39] };

/**
 * Within-tier ordering hint. More independent reasons, a pulse further outside the age band, severe
 * symptoms and the age extremes each add points; the result is clamped to the tier's range so it can
 * reorder patients of equal priority but never move anyone between priorities.
 */
export function acuityScore(input: TriageInput, priority: Priority, reasons: Reason[]): number {
  const [lo, hi] = TIER[priority];
  let points = Math.min(4, reasons.length) * 4;
  const hr = trustedHeartRate(input.vitals);
  if (hr !== null) {
    const band = heartRateBand(input.age);
    const over = Math.max(0, hr - band.todayAbove) / Math.max(1, band.emergencyAbove - band.todayAbove);
    const under = Math.max(0, band.todayBelow - hr) / Math.max(1, band.todayBelow - band.emergencyBelow);
    points += Math.min(1, Math.max(over, under)) * 12;
  }
  points += (input.symptoms ?? []).filter((s) => s.severity === 'severe').length * 4;
  if (input.age < rules.childAgeUnder || input.age >= rules.elderlyAgeFrom) points += 5;
  if (input.pregnant) points += 4;
  return Math.round(Math.min(hi, lo + points * ((hi - lo) / 40)));
}

export function triage(input: TriageInput): TriageResult {
  const hr = trustedHeartRate(input.vitals);
  const gaps = coverageGaps(input);

  const emergency = emergencyReasons(input, hr);
  if (emergency.length > 0) {
    return { priority: 'emergency', department: 'emergency', reasons: emergency, rulesVersion: RULES_VERSION, gaps, acuity: acuityScore(input, 'emergency', emergency) };
  }
  const today = todayReasons(input, hr);
  const priority: Priority = today.length > 0 ? 'today' : 'routine';
  // A specific see-today reason ("Fever for 3 days", "Severe headache") already names its symptom.
  const seen = new Set(today.flatMap((t) => [t.code, t.code.replace(/^severe:/, 'symptom:'), ...(t.code === 'fever_long' ? ['symptom:fever'] : [])]));
  const reasons = [...today, ...routineReasons(input).filter((r) => !seen.has(r.code))];
  return { priority, department: routeDepartment(input, priority), reasons, rulesVersion: RULES_VERSION, gaps, acuity: acuityScore(input, priority, reasons) };
}

export const PRIORITY_ORDER: Record<Priority, number> = { emergency: 0, today: 1, routine: 2 };
