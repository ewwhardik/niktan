import type { RedFlag, SymptomEntry } from './schemas';

/**
 * Offline, deterministic symptom extractor for Hindi (Devanagari), Hinglish and English.
 * It is the fallback when no LLM is reachable, and a cross-check on LLM output: the LLM may only
 * pick codes from the same fixed vocabulary.
 */

const KEYWORDS: Record<string, string[]> = {
  fever: ['बुखार', 'बुख़ार', 'ज्वर', 'ताप', 'bukhar', 'bukhaar', 'fever', 'temperature', 'jwar'],
  cough: ['खाँसी', 'खांसी', 'खासी', 'khansi', 'khaansi', 'khasi', 'cough'],
  cold: ['जुकाम', 'ज़ुकाम', 'सर्दी', 'नाक बह', 'zukam', 'jukam', 'sardi', 'runny nose', 'cold'],
  sore_throat: ['गले में खराश', 'गला खराब', 'गले में दर्द', 'gala kharab', 'gale me dard', 'sore throat', 'throat pain'],
  breathlessness: ['साँस फूल', 'सांस फूल', 'साँस लेने में', 'सांस लेने में', 'दम फूल', 'saans phool', 'sans phool', 'saans lene', 'breathless', 'short of breath', 'shortness of breath', 'difficulty breathing'],
  chest_pain: ['सीने में दर्द', 'छाती में दर्द', 'सीने में जकड़', 'seene me dard', 'seene mein dard', 'chhati me dard', 'chest pain', 'chest tightness'],
  palpitations: ['धड़कन तेज', 'धड़कन तेज़', 'घबराहट', 'dhadkan tez', 'ghabrahat', 'palpitation', 'heart racing'],
  fatigue: ['थकान', 'थकावट', 'कमजोरी', 'कमज़ोरी', 'थका', 'thakan', 'thakaan', 'kamzori', 'kamjori', 'weakness', 'tired', 'fatigue'],
  dizziness: ['चक्कर', 'chakkar', 'dizzy', 'dizziness', 'giddiness'],
  fainting: ['बेहोश हो गया', 'बेहोश हो गई', 'बेहोशी', 'behosh', 'fainted', 'fainting', 'blackout'],
  headache: ['सिरदर्द', 'सिर दर्द', 'सिर में दर्द', 'sir dard', 'sirdard', 'sar dard', 'headache'],
  abdominal_pain: ['पेट दर्द', 'पेट में दर्द', 'pet dard', 'pet me dard', 'pet mein dard', 'stomach pain', 'abdominal pain', 'tummy pain'],
  vomiting: ['उल्टी', 'उलटी', 'ulti', 'vomit', 'vomiting'],
  diarrhoea: ['दस्त', 'पतला पैखाना', 'loose motion', 'dast', 'diarrhea', 'diarrhoea'],
  constipation: ['कब्ज', 'कब्ज़', 'kabz', 'kabj', 'constipation'],
  blood_in_stool: ['मल में खून', 'पैखाने में खून', 'blood in stool', 'potty me khoon'],
  burning_urine: ['पेशाब में जलन', 'peshab me jalan', 'burning urine', 'burning urination'],
  yellow_eyes: ['आँखें पीली', 'आंखें पीली', 'पीलिया', 'peeliya', 'piliya', 'jaundice', 'yellow eyes'],
  weight_loss: ['वजन कम', 'वज़न कम', 'वजन घट', 'wajan kam', 'vajan kam', 'weight loss', 'losing weight'],
  excess_thirst: ['ज़्यादा प्यास', 'बहुत प्यास', 'बार बार पेशाब', 'bahut pyaas', 'excess thirst', 'frequent urination'],
  joint_pain: ['जोड़ों में दर्द', 'जोड़ों का दर्द', 'घुटने में दर्द', 'घुटनों में दर्द', 'jodon me dard', 'ghutne me dard', 'joint pain', 'knee pain'],
  back_pain: ['कमर दर्द', 'कमर में दर्द', 'पीठ दर्द', 'kamar dard', 'peeth dard', 'back pain'],
  injury: ['चोट', 'गिर गया', 'गिर गई', 'chot', 'injury', 'fell down'],
  swelling_legs: ['पैरों में सूजन', 'पैर में सूजन', 'pairon me sujan', 'swollen legs', 'leg swelling'],
  skin_rash: ['खुजली', 'दाने', 'चकत्ते', 'khujli', 'daane', 'rash', 'itching'],
  wound: ['घाव', 'ghaav', 'ghav', 'wound', 'ulcer'],
  blurred_vision: ['धुंधला', 'कम दिख', 'dhundhla', 'kam dikh', 'blurred vision', 'blurry'],
  sudden_vision_loss: ['अचानक दिखना बंद', 'अचानक दिखाई देना बंद', 'achanak dikhna band', 'sudden vision loss', 'suddenly cannot see'],
  red_eye: ['आँख लाल', 'आंख लाल', 'आँख में दर्द', 'aankh laal', 'aankh lal', 'red eye', 'eye pain'],
  ear_pain: ['कान दर्द', 'कान में दर्द', 'कान बह', 'kaan dard', 'kan dard', 'ear pain', 'ear discharge'],
  hearing_loss: ['कम सुनाई', 'सुनाई नहीं', 'kam sunai', 'sunai nahi', 'hearing loss', 'cannot hear'],
  toothache: ['दाँत दर्द', 'दांत दर्द', 'दाँत में दर्द', 'daant dard', 'dant dard', 'toothache', 'tooth pain'],
  missed_period: ['माहवारी नहीं', 'पीरियड नहीं', 'mahwari nahi', 'period nahi', 'missed period'],
  irregular_periods: ['माहवारी अनियमित', 'irregular period', 'periods irregular'],
  vaginal_bleeding: ['खून आ रहा है नीचे से', 'रक्तस्राव', 'ज्यादा खून जा रहा', 'vaginal bleeding', 'heavy period bleeding'],
  seizure: ['दौरा', 'मिर्गी', 'झटके', 'daura', 'mirgi', 'jhatke', 'seizure', 'fits', 'convulsion'],
  confusion: ['होश नहीं', 'उलझन', 'बात समझ नहीं', 'hosh nahi', 'confused', 'confusion'],
  numbness: ['सुन्न', 'लकवा', 'हाथ पैर कमजोर', 'sunn', 'lakwa', 'numbness', 'paralysis', 'face drooping'],
  lethargy: ['बहुत सुस्त', 'दूध नहीं पी रहा', 'खाना नहीं खा रहा', 'bahut sust', 'very drowsy', 'not feeding', 'lethargic'],
  severe_bleeding: ['बहुत खून बह', 'खून नहीं रुक', 'khoon nahi ruk', 'bahut khoon', 'heavy bleeding', 'bleeding a lot'],
};

/** Body part + pain word anywhere in the same clause, e.g. "पेट में बहुत तेज़ दर्द". */
const PAIN_PARTS: Record<string, string[]> = {
  chest_pain: ['सीने', 'सीना', 'छाती', 'seene', 'seena', 'chhati', 'chest'],
  abdominal_pain: ['पेट', 'pet', 'pait', 'stomach', 'tummy', 'abdomen'],
  headache: ['सिर', 'सर', 'sir', 'sar', 'head'],
  back_pain: ['कमर', 'पीठ', 'kamar', 'peeth', 'back'],
  ear_pain: ['कान', 'kaan', 'kan', 'ear'],
  toothache: ['दाँत', 'दांत', 'daant', 'dant', 'tooth', 'teeth'],
  joint_pain: ['घुटने', 'घुटनों', 'जोड़ों', 'ghutne', 'ghutno', 'knee', 'knees', 'joint', 'joints'],
};
const PAIN_WORDS = ['दर्द', 'पीड़ा', 'dard', 'pain', 'ache', 'aching'];

function hasPainAt(code: string, text: string): boolean {
  const parts = PAIN_PARTS[code];
  if (!parts) return false;
  const tokens = text.split(' ');
  return tokens.some((t) => PAIN_WORDS.includes(t)) && tokens.some((t) => parts.includes(t));
}

const SEVERE_WORDS = ['बहुत', 'तेज़', 'तेज', 'भयंकर', 'असहनीय', 'ज़्यादा', 'ज्यादा', 'bahut', 'tez', 'bhayankar', 'severe', 'very', 'unbearable', 'extreme'];
const MILD_WORDS = ['थोड़ा', 'थोड़ी', 'हल्का', 'हल्की', 'thoda', 'thodi', 'thori', 'halka', 'halki', 'mild', 'slight', 'little'];

const HINDI_NUMBERS: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const DEVANAGARI_DIGITS = '०१२३४५६७८९';

const UNIT_DAYS: [RegExp, number][] = [
  [/^(दिन|din|day|days)/, 1],
  [/^(हफ्ते|हफ़्ते|हफ्ता|हफ़्ता|सप्ताह|hafte|hafta|week|weeks)/, 7],
  [/^(महीने|महीना|mahine|mahina|month|months)/, 30],
  [/^(साल|वर्ष|saal|year|years)/, 365],
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/[।,.!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses durations like "3 din", "तीन दिन से", "2 weeks", "ek mahine". Returns days. */
export function parseDuration(text: string): number | null {
  const tokens = normalise(text).split(' ');
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i]!;
    const n = /^\d+(\.\d+)?$/.test(t) ? Number(t) : HINDI_NUMBERS[t];
    if (n === undefined) continue;
    const unit = UNIT_DAYS.find(([re]) => re.test(tokens[i + 1]!));
    if (unit) return n * unit[1];
  }
  const t = normalise(text);
  if (/(कल से|kal se|since yesterday)/.test(t)) return 1;
  if (/(आज से|aaj se|since today|today)/.test(t)) return 0;
  return null;
}

interface Clause {
  text: string;
}

/** Splits on conjunctions so "3 din se bukhar aur thodi khansi" gives each symptom its own modifiers. */
function clauses(text: string): Clause[] {
  return normalise(text)
    .split(/\s(?:और|तथा|एवं|aur|and|also|plus|साथ में|sath me)\s|\s(?:लेकिन|par|but)\s/)
    .map((c) => ({ text: c.trim() }))
    .filter((c) => c.text.length > 0);
}

export interface ParsedSymptoms {
  symptoms: SymptomEntry[];
  redFlags: Partial<Record<RedFlag, boolean>>;
}

const RED_FLAG_FROM_SYMPTOM: Partial<Record<string, RedFlag>> = {
  chest_pain: 'chest_pain',
  seizure: 'seizure',
  severe_bleeding: 'severe_bleeding',
};

export function parseSymptoms(text: string, context: { age?: number; pregnant?: boolean } = {}): ParsedSymptoms {
  const found = new Map<string, SymptomEntry>();
  const parts = clauses(text);
  const wholeDuration = parseDuration(text);

  for (const part of parts) {
    for (const [code, words] of Object.entries(KEYWORDS)) {
      if (found.has(code)) continue;
      if (!words.some((w) => part.text.includes(w.toLowerCase())) && !hasPainAt(code, part.text)) continue;
      const severe = SEVERE_WORDS.some((w) => part.text.includes(w));
      const mild = MILD_WORDS.some((w) => part.text.includes(w));
      found.set(code, {
        code,
        durationDays: parseDuration(part.text) ?? (parts.length === 1 ? wholeDuration : null),
        severity: severe ? 'severe' : mild ? 'mild' : 'moderate',
      });
    }
  }

  // "sudden vision loss" is a stronger match than "blurred"; keep only the stronger one.
  if (found.has('sudden_vision_loss')) found.delete('blurred_vision');

  const redFlags: Partial<Record<RedFlag, boolean>> = {};
  for (const code of found.keys()) {
    const flag = RED_FLAG_FROM_SYMPTOM[code];
    if (flag) redFlags[flag] = true;
  }
  if (found.get('breathlessness')?.severity === 'severe') redFlags.breathlessness = true;
  if (/(बेहोश है|होश में नहीं|unconscious|not responding)/.test(normalise(text))) redFlags.unconscious = true;
  if (context.pregnant && found.has('vaginal_bleeding')) redFlags.pregnancy_bleeding = true;
  if ((context.age ?? 99) < 5 && found.has('lethargy')) redFlags.child_lethargic = true;

  return { symptoms: [...found.values()], redFlags };
}
