import { describe, expect, it } from 'vitest';
import { parseDuration, parseSymptoms } from '../src/symptomParser';
import { triage } from '../src/triage';

const codes = (text: string) => parseSymptoms(text).symptoms.map((s) => s.code).sort();

describe('parseDuration', () => {
  it.each([
    ['3 दिन से बुखार', 3],
    ['तीन दिन से', 3],
    ['३ दिन', 3],
    ['teen din se bukhar', 3],
    ['2 hafte se khansi', 14],
    ['ek mahine se', 30],
    ['for 5 days', 5],
    ['kal se sir dard', 1],
  ])('%s → %i days', (text, days) => {
    expect(parseDuration(text)).toBe(days);
  });

  it('returns null when no duration is said', () => {
    expect(parseDuration('बुखार है')).toBeNull();
  });
});

describe('parseSymptoms', () => {
  it('Hindi chest pain + breathlessness raises red flags', () => {
    const r = parseSymptoms('सीने में दर्द और साँस फूल रही है');
    expect(r.symptoms.map((s) => s.code).sort()).toEqual(['breathlessness', 'chest_pain']);
    expect(r.redFlags.chest_pain).toBe(true);
  });

  it('Hinglish fever with duration and mild cough', () => {
    const r = parseSymptoms('teen din se bukhar hai aur thodi khansi');
    const fever = r.symptoms.find((s) => s.code === 'fever');
    const cough = r.symptoms.find((s) => s.code === 'cough');
    expect(fever?.durationDays).toBe(3);
    expect(cough?.severity).toBe('mild');
  });

  it('English input works', () => {
    expect(codes('I have a headache and loose motion since yesterday')).toEqual(['diarrhoea', 'headache']);
  });

  it('severity words mark severe', () => {
    expect(parseSymptoms('पेट में बहुत तेज़ दर्द').symptoms[0]).toMatchObject({ code: 'abdominal_pain', severity: 'severe' });
  });

  it('severe breathlessness is a red flag', () => {
    expect(parseSymptoms('bahut saans phool rahi hai').redFlags.breathlessness).toBe(true);
  });

  it('pregnant bleeding raises the pregnancy red flag only in pregnancy', () => {
    expect(parseSymptoms('vaginal bleeding', { pregnant: true }).redFlags.pregnancy_bleeding).toBe(true);
    expect(parseSymptoms('vaginal bleeding', { pregnant: false }).redFlags.pregnancy_bleeding).toBeUndefined();
  });

  it('lethargic toddler raises the child red flag', () => {
    expect(parseSymptoms('bachcha bahut sust hai, doodh nahi pee raha', { age: 2 }).redFlags.child_lethargic).toBe(true);
  });

  it('sudden vision loss wins over blurred', () => {
    expect(codes('achanak dikhna band, sab dhundhla')).toEqual(['sudden_vision_loss']);
  });

  it('no symptoms in small talk', () => {
    expect(parseSymptoms('नमस्ते, मैं ठीक हूँ').symptoms).toEqual([]);
  });

  it('end to end: spoken chest pain becomes an emergency', () => {
    const p = parseSymptoms('सीने में दर्द है');
    expect(triage({ age: 50, sex: 'male', pregnant: false, ...p }).priority).toBe('emergency');
  });

  it('end to end: 4 days fever is see-today', () => {
    const p = parseSymptoms('4 din se bukhar');
    expect(triage({ age: 30, sex: 'female', pregnant: false, ...p }).priority).toBe('today');
  });
});
