import { describe, expect, it } from 'vitest';
import { triage, routeDepartment, visionNeedsReferral, type TriageInput } from '../src/triage';
import type { SymptomEntry } from '../src/schemas';

const adult: TriageInput = { age: 34, sex: 'female', pregnant: false };
const sym = (code: string, extra: Partial<SymptomEntry> = {}): SymptomEntry => ({
  code,
  durationDays: null,
  severity: 'moderate',
  ...extra,
});
const vitals = (heartRate: number, quality = 0.9) => ({ heartRate, breathingRate: null, quality });
const eye = (flags: { pallor?: boolean; jaundice?: boolean; cataract?: boolean }) => ({
  pallor: flags.pallor ?? false,
  pallorScore: null,
  jaundice: flags.jaundice ?? false,
  cataract: flags.cataract ?? false,
  quality: 0.9,
});
const codes = (input: TriageInput) => triage(input).reasons.map((r) => r.code);

describe('emergency rules', () => {
  it.each([
    'chest_pain',
    'breathlessness',
    'unconscious',
    'severe_bleeding',
    'seizure',
    'pregnancy_bleeding',
    'child_lethargic',
  ] as const)('confirmed red flag %s is an emergency', (flag) => {
    const r = triage({ ...adult, redFlags: { [flag]: true } });
    expect(r.priority).toBe('emergency');
    expect(r.department).toBe('emergency');
    expect(r.reasons[0]?.code).toBe(`red_flag:${flag}`);
  });

  it('false red flags do nothing', () => {
    expect(triage({ ...adult, redFlags: { chest_pain: false } }).priority).toBe('routine');
  });

  it('chest pain as a symptom is an emergency even without the flag', () => {
    expect(triage({ ...adult, symptoms: [sym('chest_pain')] }).priority).toBe('emergency');
  });

  it('does not duplicate a reason given as both flag and symptom', () => {
    const r = triage({ ...adult, symptoms: [sym('chest_pain')], redFlags: { chest_pain: true } });
    expect(r.reasons.filter((x) => x.code === 'red_flag:chest_pain')).toHaveLength(1);
  });

  it('severe breathlessness is an emergency, moderate is not', () => {
    expect(triage({ ...adult, symptoms: [sym('breathlessness', { severity: 'severe' })] }).priority).toBe('emergency');
    expect(triage({ ...adult, symptoms: [sym('breathlessness')] }).priority).toBe('routine');
  });

  it('HR above 130 with good quality is an emergency', () => {
    expect(triage({ ...adult, vitals: vitals(142) }).priority).toBe('emergency');
  });

  it('HR below 40 with good quality is an emergency', () => {
    expect(triage({ ...adult, vitals: vitals(36) }).priority).toBe('emergency');
  });

  it('HR exactly 130 is see-today, not emergency', () => {
    expect(triage({ ...adult, vitals: vitals(130) }).priority).toBe('today');
  });

  it('low-quality vitals are ignored', () => {
    expect(triage({ ...adult, vitals: vitals(160, 0.2) }).priority).toBe('routine');
  });

  it('lethargic child under 5 is an emergency', () => {
    const r = triage({ age: 2, sex: 'male', pregnant: false, symptoms: [sym('lethargy')] });
    expect(r.priority).toBe('emergency');
    expect(r.reasons.map((x) => x.code)).toContain('red_flag:child_lethargic');
  });

  it('lethargy at age 10 routes to paediatrics but is not an emergency', () => {
    const r = triage({ age: 10, sex: 'male', pregnant: false, symptoms: [sym('lethargy')] });
    expect(r.priority).toBe('routine');
    expect(r.department).toBe('paediatrics');
  });

  it('pregnant with vaginal bleeding is an emergency', () => {
    const r = triage({ ...adult, pregnant: true, symptoms: [sym('vaginal_bleeding')] });
    expect(r.priority).toBe('emergency');
  });

  it('not pregnant with vaginal bleeding goes to gynaecology routinely', () => {
    const r = triage({ ...adult, symptoms: [sym('vaginal_bleeding')] });
    expect(r.priority).toBe('routine');
    expect(r.department).toBe('gynaecology');
  });
});

describe('see-today rules', () => {
  it('HR 115 is see-today', () => {
    expect(triage({ ...adult, vitals: vitals(115) }).priority).toBe('today');
  });

  it('HR 45 is see-today', () => {
    expect(triage({ ...adult, vitals: vitals(45) }).priority).toBe('today');
  });

  it('HR 72 is routine', () => {
    expect(triage({ ...adult, vitals: vitals(72) }).priority).toBe('routine');
  });

  it('fever for 3 days is see-today, 2 days is routine', () => {
    expect(triage({ ...adult, symptoms: [sym('fever', { durationDays: 3 })] }).priority).toBe('today');
    expect(triage({ ...adult, symptoms: [sym('fever', { durationDays: 2 })] }).priority).toBe('routine');
  });

  it('fever with unknown duration is routine', () => {
    expect(triage({ ...adult, symptoms: [sym('fever')] }).priority).toBe('routine');
  });

  it('jaundice flag is see-today in medicine', () => {
    const r = triage({ ...adult, eye: eye({ jaundice: true }) });
    expect(r.priority).toBe('today');
    expect(r.department).toBe('medicine');
  });

  it('pallor with fatigue is see-today', () => {
    expect(codes({ ...adult, eye: eye({ pallor: true }), symptoms: [sym('fatigue')] })).toContain('pallor_symptomatic');
  });

  it('pallor alone is routine with an Hb test reason', () => {
    const r = triage({ ...adult, eye: eye({ pallor: true }) });
    expect(r.priority).toBe('routine');
    expect(r.reasons.map((x) => x.code)).toContain('pallor_flag');
  });

  it('sudden vision loss is see-today in ophthalmology', () => {
    const r = triage({ ...adult, symptoms: [sym('sudden_vision_loss')] });
    expect(r.priority).toBe('today');
    expect(r.department).toBe('ophthalmology');
  });

  it('any severe symptom is see-today', () => {
    const r = triage({ ...adult, symptoms: [sym('back_pain', { severity: 'severe' })] });
    expect(r.priority).toBe('today');
    expect(r.department).toBe('orthopaedics');
    expect(r.reasons.map((x) => x.code)).toEqual(['severe:back_pain']);
  });

  it('elderly with breathlessness is see-today', () => {
    expect(triage({ ...adult, age: 70, symptoms: [sym('breathlessness')] }).priority).toBe('today');
  });

  it('see-today keeps routine screening reasons too', () => {
    const r = triage({ ...adult, vitals: vitals(118), hearing: { srtDb: -2, result: 'refer' } });
    expect(r.reasons.map((x) => x.code)).toEqual(['hr_high', 'hearing_refer']);
  });
});

describe('routine and missing data', () => {
  it('no data at all is routine medicine with no reasons', () => {
    const r = triage(adult);
    expect(r).toMatchObject({ priority: 'routine', department: 'medicine', reasons: [] });
  });

  it('null modules are treated as skipped', () => {
    expect(triage({ ...adult, vitals: null, eye: null, vision: null, hearing: null }).priority).toBe('routine');
  });

  it('result carries the rules version', () => {
    expect(triage(adult).rulesVersion).toMatch(/^\d{4}\./);
  });
});

describe('department routing', () => {
  it('children under 14 go to paediatrics', () => {
    expect(triage({ age: 8, sex: 'female', pregnant: false, symptoms: [sym('cough')] }).department).toBe('paediatrics');
  });

  it('the most severe symptom decides the department', () => {
    const r = triage({ ...adult, symptoms: [sym('cough', { severity: 'mild' }), sym('skin_rash', { severity: 'moderate' })] });
    expect(r.department).toBe('dermatology');
  });

  it('ties on severity are broken by duration', () => {
    const r = triage({
      ...adult,
      symptoms: [sym('toothache', { durationDays: 2 }), sym('joint_pain', { durationDays: 30 })],
    });
    expect(r.department).toBe('orthopaedics');
  });

  it('pregnant with abdominal pain goes to gynaecology', () => {
    expect(routeDepartment({ ...adult, pregnant: true, symptoms: [sym('abdominal_pain')] }, 'today')).toBe('gynaecology');
  });

  it('cataract flag with no symptoms goes to ophthalmology', () => {
    expect(triage({ ...adult, eye: eye({ cataract: true }) }).department).toBe('ophthalmology');
  });

  it('hearing refer with no symptoms goes to ENT', () => {
    expect(triage({ ...adult, hearing: { srtDb: -3, result: 'refer' } }).department).toBe('ent');
  });

  it('"other" symptom alone falls back to medicine', () => {
    expect(triage({ ...adult, symptoms: [sym('other')] }).department).toBe('medicine');
  });
});

describe('vision referral', () => {
  it('6/12 or better in both eyes passes', () => {
    expect(visionNeedsReferral({ leftLogMar: 0.3, rightLogMar: 0.3 })).toBe(false);
  });

  it('one line worse than 6/12 refers even with similar eyes', () => {
    expect(visionNeedsReferral({ leftLogMar: 0.4, rightLogMar: 0.3 })).toBe(true);
  });

  it('two-line difference between eyes refers', () => {
    expect(visionNeedsReferral({ leftLogMar: 0.1, rightLogMar: 0.3 })).toBe(true);
  });

  it('one eye untested only checks the tested eye', () => {
    expect(visionNeedsReferral({ leftLogMar: null, rightLogMar: 0.1 })).toBe(false);
  });

  it('missing vision is not a referral', () => {
    expect(visionNeedsReferral(null)).toBe(false);
  });
});

describe('declined red flags', () => {
  it('chest pain the patient says is not happening now is see-today, not emergency', () => {
    const r = triage({ ...adult, symptoms: [sym('chest_pain')], declinedRedFlags: ['chest_pain'] });
    expect(r.priority).toBe('today');
    expect(r.reasons.map((x) => x.code)).toContain('declined:chest_pain');
  });

  it('declining one flag does not hide another', () => {
    const r = triage({ ...adult, symptoms: [sym('chest_pain'), sym('seizure')], declinedRedFlags: ['chest_pain'] });
    expect(r.priority).toBe('emergency');
  });

  it('declined pregnancy bleeding is see-today in gynaecology', () => {
    const r = triage({ ...adult, pregnant: true, symptoms: [sym('vaginal_bleeding')], declinedRedFlags: ['pregnancy_bleeding'] });
    expect(r.priority).toBe('today');
    expect(r.department).toBe('gynaecology');
  });
});

it('keeps adult pulse thresholds out of infant triage while honouring confirmed symptoms', () => {
  const infant = { age: 0, sex: 'male' as const, pregnant: false, vitals: vitals(150) };
  expect(triage(infant).reasons.some((reason) => reason.code.startsWith('hr_'))).toBe(false);
  expect(triage({ ...infant, redFlags: { child_lethargic: true } }).priority).toBe('emergency');
});

describe('age-banded heart rate', () => {
  const child = (age: number, heartRate: number) => triage({ age, sex: 'male', pregnant: false, vitals: { heartRate, breathingRate: null, quality: 0.9 } });

  it('a 10-year-old at 220 bpm is an emergency', () => {
    expect(child(10, 220).priority).toBe('emergency');
  });

  it('a 10-year-old at 35 bpm is an emergency', () => {
    expect(child(10, 35).priority).toBe('emergency');
  });

  it('a normal infant pulse of 140 is routine, though it would alarm in an adult', () => {
    expect(child(0, 140).priority).toBe('routine');
    expect(child(30, 140).priority).toBe('emergency');
  });

  it('a 3-year-old at 170 is see-today', () => {
    expect(child(3, 170).priority).toBe('today');
  });

  it('low-quality child readings are still ignored', () => {
    expect(triage({ age: 6, sex: 'female', pregnant: false, vitals: { heartRate: 240, breathingRate: null, quality: 0.2 } }).priority).toBe('routine');
  });
});

describe('coverage gaps', () => {
  it('names every check that was skipped or unreliable', () => {
    const r = triage({ ...adult, vitals: vitals(80, 0.2) });
    expect(r.gaps.map((g) => g.code)).toEqual(['gap:vitals_quality', 'gap:eye', 'gap:vision', 'gap:hearing']);
  });

  it('is empty when every check produced a usable reading', () => {
    const r = triage({ ...adult, vitals: vitals(80), eye: eye({}), vision: { leftLogMar: 0, rightLogMar: 0, distanceMm: 2000 } as never, hearing: { result: 'pass', srtDb: -12 } as never });
    expect(r.gaps).toEqual([]);
  });

  it('never changes the priority', () => {
    expect(triage({ ...adult }).priority).toBe('routine');
    expect(triage({ ...adult, vitals: vitals(150, 0.1) }).priority).toBe('routine');
  });
});

describe('acuity', () => {
  const tiers = { emergency: [80, 100], today: [40, 79], routine: [0, 39] } as const;

  it('stays inside its priority tier', () => {
    const cases: TriageInput[] = [
      { ...adult },
      { ...adult, age: 80, symptoms: [sym('cough', { severity: 'severe' }), sym('fatigue', { severity: 'severe' })] },
      { ...adult, symptoms: [sym('fever', { durationDays: 5 })], vitals: vitals(125) },
      { ...adult, age: 2, pregnant: false, vitals: vitals(185), symptoms: [sym('fever', { durationDays: 4, severity: 'severe' })] },
      { ...adult, redFlags: { chest_pain: true, breathlessness: true }, vitals: vitals(170), age: 70 },
    ];
    for (const c of cases) {
      const r = triage(c);
      const [lo, hi] = tiers[r.priority];
      expect(r.acuity).toBeGreaterThanOrEqual(lo);
      expect(r.acuity).toBeLessThanOrEqual(hi);
    }
  });

  it('ranks a sicker same-tier patient higher', () => {
    const mild = triage({ ...adult, symptoms: [sym('fever', { durationDays: 3 })] });
    const worse = triage({ ...adult, age: 72, vitals: vitals(126), symptoms: [sym('fever', { durationDays: 3, severity: 'severe' }), sym('breathlessness')] });
    expect(mild.priority).toBe('today');
    expect(worse.priority).toBe('today');
    expect(worse.acuity).toBeGreaterThan(mild.acuity);
  });
});
