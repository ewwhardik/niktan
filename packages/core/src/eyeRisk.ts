import type { EyeFlags, Vision } from './schemas';

/**
 * Jaundice and cataract screening by fusing what the camera measured with what the person reports.
 * Neither camera signal is trusted alone at its weaker level: a "possible" image reading needs a
 * matching symptom to become "likely". Thresholds are provisional (no local labelled data yet) and
 * chosen to keep the false-positive rate low; every result is phrased as "get it checked".
 */

export type RiskLevel = 'low' | 'possible' | 'likely';

export interface EyeRisk {
  /** null when nothing was measured or answered. */
  level: RiskLevel | null;
  /** What drove the level, as short codes for the card and the doctor's view. */
  signals: string[];
}

export const EYE_RULES = {
  jaundice: {
    /** White-referenced sclera b*. Healthy adult sclera sits around 4–12 under a white reference. */
    possibleB: 15,
    likelyB: 21,
    /** Without a white reference the room's light colour leaks in, so the image alone can only reach "possible". */
    unreferencedPossibleB: 24,
  },
  cataract: {
    /** Pupil lightness / sclera lightness. A clear pupil is near-black (about 0.05–0.2). */
    possibleOpacity: 0.3,
    likelyOpacity: 0.45,
    /** logCS lost when the glare ring is on; normal eyes lose about 0–0.15. */
    glareLossLogCs: 0.3,
    /** Worse than 6/12 in either eye. */
    poorAcuityLogMar: 0.3,
    ageFrom: 50,
  },
} as const;

const rank: Record<RiskLevel, number> = { low: 0, possible: 1, likely: 2 };
const byRank: RiskLevel[] = ['low', 'possible', 'likely'];

function imageJaundice(eye: EyeFlags): RiskLevel | null {
  const b = eye.scleraB;
  if (b === undefined) {
    // Records from before the fused check: keep their boolean.
    return eye.jaundice == null ? null : eye.jaundice ? 'likely' : 'low';
  }
  if (b === null) return null;
  const r = EYE_RULES.jaundice;
  let level: RiskLevel = eye.scleraReferenced
    ? b >= r.likelyB ? 'likely' : b >= r.possibleB ? 'possible' : 'low'
    : b >= r.unreferencedPossibleB ? 'possible' : 'low';
  // The two eyes disagreeing usually means a shadow or a reflection on one side.
  if (eye.eyesAgree === false && level !== 'low') level = byRank[rank[level] - 1]!;
  return level;
}

export function assessJaundice(eye?: EyeFlags | null): EyeRisk {
  if (!eye) return { level: null, signals: [] };
  const image = imageJaundice(eye);
  const a = eye.answers ?? {};
  const symptoms = [a.yellowEyes, a.darkUrine].filter((v) => v === true).length;
  const answered = a.yellowEyes != null || a.darkUrine != null;
  const signals: string[] = [];
  if (image === 'likely') signals.push('sclera_yellow');
  if (image === 'possible') signals.push('sclera_tint');
  if (a.yellowEyes) signals.push('reported_yellow_eyes');
  if (a.darkUrine) signals.push('reported_dark_urine');
  if (image === null && !answered) return { level: null, signals };
  const img = image === null ? 0 : rank[image];
  const level: RiskLevel = img === 2 || (img === 1 && symptoms >= 1) || symptoms === 2 ? 'likely' : img === 1 || symptoms === 1 ? 'possible' : 'low';
  return { level, signals };
}

function imageCataract(eye: EyeFlags): RiskLevel | null {
  const o = eye.pupilOpacity;
  if (o === undefined) return eye.cataract == null ? null : eye.cataract ? 'likely' : 'low';
  if (o === null) return null;
  const r = EYE_RULES.cataract;
  return o >= r.likelyOpacity ? 'likely' : o >= r.possibleOpacity ? 'possible' : 'low';
}

/** Cataract risk from the pupil photo, glare and acuity tests, symptoms and age. */
export function assessCataract(eye: EyeFlags | null | undefined, age: number, vision?: Vision | null): EyeRisk {
  const r = EYE_RULES.cataract;
  const image = eye ? imageCataract(eye) : null;
  const a = eye?.answers ?? {};
  const glareLoss = vision?.contrastLogCs != null && vision.glareLogCs != null ? vision.contrastLogCs - vision.glareLogCs : null;
  const worstAcuity = vision ? Math.max(vision.rightLogMar ?? -1, vision.leftLogMar ?? -1) : -1;
  const signals: string[] = [];
  if (image === 'likely') signals.push('pupil_opaque');
  if (image === 'possible') signals.push('pupil_hazy');
  if (a.cloudyVision) signals.push('reported_cloudy');
  if (a.nightGlare) signals.push('reported_glare');
  if (glareLoss !== null && glareLoss >= r.glareLossLogCs - 1e-9) signals.push('glare_loss');
  if (worstAcuity > r.poorAcuityLogMar) signals.push('poor_acuity');
  // Functional evidence: symptoms and test results that point at a clouded lens.
  const functional = ['reported_cloudy', 'reported_glare', 'glare_loss', 'poor_acuity'].filter((s) => signals.includes(s)).length;
  const lensSpecific = signals.includes('reported_cloudy') || signals.includes('glare_loss');
  const older = age >= r.ageFrom;
  const measured = image !== null || a.cloudyVision != null || a.nightGlare != null || glareLoss !== null;
  if (!measured) return { level: null, signals };
  const img = image === null ? 0 : rank[image];
  let level: RiskLevel = 'low';
  if (img === 2 || (img === 1 && functional >= 1) || (older && lensSpecific && functional >= 3)) level = 'likely';
  else if (img === 1 || (lensSpecific && functional >= 2) || (older && lensSpecific)) level = 'possible';
  return { level, signals };
}
