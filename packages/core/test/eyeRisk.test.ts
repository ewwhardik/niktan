import { describe, expect, it } from 'vitest';
import { assessCataract, assessJaundice } from '../src/eyeRisk';
import { triage } from '../src/triage';
import type { EyeFlags, Vision } from '../src/schemas';

const eye = (over: Partial<EyeFlags> = {}): EyeFlags => ({ pallor: false, pallorScore: null, jaundice: null, cataract: null, quality: 0.9, ...over });
const vision = (over: Partial<Vision> = {}): Vision => ({ distanceMm: 400, rightLogMar: 0, leftLogMar: 0, ...over });

describe('jaundice fusion', () => {
  it('a white-referenced yellow sclera is likely on its own', () => {
    expect(assessJaundice(eye({ scleraB: 24, scleraReferenced: true, eyesAgree: true })).level).toBe('likely');
  });

  it('without a white reference the photo alone never goes past possible', () => {
    expect(assessJaundice(eye({ scleraB: 30, scleraReferenced: false, eyesAgree: true })).level).toBe('possible');
    expect(assessJaundice(eye({ scleraB: 18, scleraReferenced: false })).level).toBe('low');
  });

  it('a faint tint becomes likely only with a matching symptom', () => {
    const tint = { scleraB: 17, scleraReferenced: true, eyesAgree: true };
    expect(assessJaundice(eye(tint)).level).toBe('possible');
    expect(assessJaundice(eye({ ...tint, answers: { darkUrine: true } })).level).toBe('likely');
  });

  it('eyes that disagree lower the photo reading one step', () => {
    expect(assessJaundice(eye({ scleraB: 24, scleraReferenced: true, eyesAgree: false })).level).toBe('possible');
  });

  it('reported yellow eyes and dark urine together are likely even without a photo', () => {
    expect(assessJaundice(eye({ scleraB: null, answers: { yellowEyes: true, darkUrine: true } })).level).toBe('likely');
    expect(assessJaundice(eye({ scleraB: null, answers: { yellowEyes: false, darkUrine: false } })).level).toBe('low');
    expect(assessJaundice(eye({ scleraB: null })).level).toBeNull();
  });

  it('records from before the fused check keep their boolean', () => {
    expect(assessJaundice(eye({ jaundice: true })).level).toBe('likely');
  });
});

describe('cataract fusion', () => {
  it('a grey-white pupil is likely; a black pupil is low', () => {
    expect(assessCataract(eye({ pupilOpacity: 0.6 }), 65).level).toBe('likely');
    expect(assessCataract(eye({ pupilOpacity: 0.1 }), 65).level).toBe('low');
  });

  it('a hazy pupil plus cloudy vision is likely', () => {
    expect(assessCataract(eye({ pupilOpacity: 0.35 }), 62).level).toBe('possible');
    expect(assessCataract(eye({ pupilOpacity: 0.35, answers: { cloudyVision: true } }), 62).level).toBe('likely');
  });

  it('glare disability counts: contrast drops 0.3 log or more under the glare ring', () => {
    const v = vision({ contrastLogCs: 1.65, glareLogCs: 1.2 });
    expect(assessCataract(eye({ pupilOpacity: 0.1 }), 40, v).signals).toContain('glare_loss');
    expect(assessCataract(eye({ pupilOpacity: 0.1 }), 40, vision({ contrastLogCs: 1.65, glareLogCs: 1.5 })).signals).not.toContain('glare_loss');
  });

  it('an older adult with cloudy vision, night glare and a glare-test drop is likely without a photo', () => {
    const v = vision({ contrastLogCs: 1.5, glareLogCs: 1.05, rightLogMar: 0.4 });
    expect(assessCataract(eye({ pupilOpacity: null, answers: { cloudyVision: true, nightGlare: true } }), 68, v).level).toBe('likely');
  });

  it('night glare alone in a young adult stays low', () => {
    expect(assessCataract(eye({ pupilOpacity: 0.12, answers: { nightGlare: true, cloudyVision: false } }), 25).level).toBe('low');
  });

  it('nothing measured gives no verdict', () => {
    expect(assessCataract(null, 60).level).toBeNull();
  });
});

describe('triage with fused eye results', () => {
  const adult = { age: 64, sex: 'female' as const, pregnant: false };

  it('likely jaundice is see-today in General Medicine', () => {
    const r = triage({ ...adult, eye: eye({ scleraB: 25, scleraReferenced: true, eyesAgree: true }) });
    expect(r.priority).toBe('today');
    expect(r.department).toBe('medicine');
  });

  it('possible jaundice is a routine reminder, not see-today', () => {
    const r = triage({ ...adult, eye: eye({ scleraB: 17, scleraReferenced: true, eyesAgree: true }) });
    expect(r.priority).toBe('routine');
    expect(r.reasons.map((x) => x.code)).toContain('jaundice_possible');
  });

  it('cataract signs route to ophthalmology, and the glare test adds its own reason', () => {
    const r = triage({ ...adult, eye: eye({ pupilOpacity: 0.36, answers: { cloudyVision: true } }), vision: vision({ contrastLogCs: 1.65, glareLogCs: 1.2 }) });
    expect(r.department).toBe('ophthalmology');
    expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(['cataract_flag', 'glare_loss']));
  });
});
