/**
 * Common lab tests in Indian reports, with plain-language notes. Flags are never taken from the AI:
 * they are computed here from the value and the range printed on the report. Notes explain what a
 * test measures and what a low or high result can mean; they never diagnose.
 */

type Text = { en: string; hi: string };

export interface LabTest {
  key: string;
  match: RegExp;
  what: Text;
  low?: Text;
  high?: Text;
  /** Values that need a doctor soon, only applied when the report's unit is the one given. */
  urgent?: { unit: RegExp; below?: number; above?: number };
}

export const LAB_TESTS: LabTest[] = [
  {
    key: 'hb', match: /\b(h(a)?emoglobin|hb|hgb)\b/i,
    what: { en: 'The oxygen-carrying protein in red blood cells.', hi: 'लाल रक्त कोशिकाओं में ऑक्सीजन ले जाने वाला प्रोटीन।' },
    low: { en: 'Low haemoglobin is called anaemia. Iron-rich food helps many people, but a doctor should find the cause.', hi: 'कम हीमोग्लोबिन को एनीमिया कहते हैं। आयरन वाला भोजन मदद करता है, पर कारण डॉक्टर से पता करें।' },
    high: { en: 'High haemoglobin can come from dehydration, smoking or living at altitude. Mention it to a doctor.', hi: 'ज़्यादा हीमोग्लोबिन पानी की कमी, धूम्रपान या ऊँचाई पर रहने से हो सकता है। डॉक्टर को बताएँ।' },
    urgent: { unit: /g\s*\/\s*dl/i, below: 7 },
  },
  { key: 'rbc', match: /\b(rbc|red (blood )?cell count|erythrocyte count)\b/i, what: { en: 'How many red blood cells you have.', hi: 'लाल रक्त कोशिकाओं की गिनती।' }, low: { en: 'Often goes with anaemia.', hi: 'अक्सर एनीमिया के साथ होता है।' } },
  {
    key: 'wbc', match: /\b(wbc|tlc|total (leu[ck]ocyte|wbc) count|white (blood )?cell)/i,
    what: { en: 'White blood cells, which fight infection.', hi: 'सफ़ेद रक्त कोशिकाएँ, जो संक्रमण से लड़ती हैं।' },
    low: { en: 'Low counts can follow viral fevers or some medicines.', hi: 'वायरल बुखार या कुछ दवाओं के बाद कम हो सकती हैं।' },
    high: { en: 'High counts are common with infection or inflammation.', hi: 'संक्रमण या सूजन में अक्सर बढ़ जाती हैं।' },
  },
  {
    key: 'platelets', match: /\bplatelet/i,
    what: { en: 'Cells that help blood clot.', hi: 'कोशिकाएँ जो खून जमने में मदद करती हैं।' },
    low: { en: 'Low platelets are common in dengue and some infections. Watch for bleeding and see a doctor.', hi: 'डेंगू और कुछ संक्रमण में प्लेटलेट्स कम होते हैं। खून बहने पर ध्यान दें और डॉक्टर को दिखाएँ।' },
    urgent: { unit: /(lakh|10\^?3|10³|\/\s*(cumm|µl|ul|mm3))/i, below: 50000 },
  },
  { key: 'mcv', match: /\b(mcv|mean corpuscular volume)\b/i, what: { en: 'The average size of red blood cells.', hi: 'लाल रक्त कोशिकाओं का औसत आकार।' }, low: { en: 'Small cells are typical of iron deficiency.', hi: 'छोटी कोशिकाएँ अक्सर आयरन की कमी में होती हैं।' }, high: { en: 'Large cells can point to low vitamin B12 or folate.', hi: 'बड़ी कोशिकाएँ विटामिन B12 या फ़ोलेट की कमी दिखा सकती हैं।' } },
  { key: 'pcv', match: /\b(pcv|h(a)?ematocrit|hct)\b/i, what: { en: 'The share of blood made of red cells.', hi: 'खून में लाल कोशिकाओं का हिस्सा।' } },
  { key: 'esr', match: /\besr\b|erythrocyte sedimentation/i, what: { en: 'A general sign of inflammation in the body.', hi: 'शरीर में सूजन का एक सामान्य संकेत।' }, high: { en: 'Raised in many infections and inflammatory conditions; not specific on its own.', hi: 'कई संक्रमण और सूजन में बढ़ता है; अकेले से कुछ तय नहीं होता।' } },
  {
    key: 'glucoseFasting', match: /(fasting|fbs|fbg).{0,20}(glucose|sugar)|(glucose|sugar).{0,12}fasting|\bfbs\b/i,
    what: { en: 'Blood sugar after not eating for 8 hours or more.', hi: '8 घंटे या ज़्यादा भूखे रहने के बाद ब्लड शुगर।' },
    high: { en: 'High fasting sugar can mean diabetes or prediabetes. A doctor confirms it with repeat tests.', hi: 'ज़्यादा फ़ास्टिंग शुगर डायबिटीज़ या प्री-डायबिटीज़ हो सकती है। डॉक्टर दोबारा जाँच से पुष्टि करते हैं।' },
    low: { en: 'Low sugar can cause shakiness and sweating. Eat something and tell a doctor.', hi: 'कम शुगर से कंपकंपी और पसीना आ सकता है। कुछ खाएँ और डॉक्टर को बताएँ।' },
    urgent: { unit: /mg\s*\/\s*dl/i, below: 54, above: 250 },
  },
  {
    key: 'glucose', match: /(post ?prandial|pp|random|rbs).{0,20}(glucose|sugar)|blood (glucose|sugar)|\b(ppbs|rbs)\b/i,
    what: { en: 'Blood sugar after a meal or at a random time.', hi: 'खाने के बाद या किसी भी समय का ब्लड शुगर।' },
    high: { en: 'High after-meal sugar can mean diabetes. Show this to a doctor.', hi: 'खाने के बाद ज़्यादा शुगर डायबिटीज़ हो सकती है। डॉक्टर को दिखाएँ।' },
    urgent: { unit: /mg\s*\/\s*dl/i, below: 54, above: 300 },
  },
  { key: 'hba1c', match: /\b(hba1c|a1c|glyc(at|os)ed h(a)?emoglobin)\b/i, what: { en: 'Average blood sugar over the past three months.', hi: 'पिछले तीन महीनों का औसत ब्लड शुगर।' }, high: { en: '6.5% or more usually means diabetes; 5.7–6.4% is prediabetes.', hi: '6.5% या ज़्यादा आमतौर पर डायबिटीज़; 5.7–6.4% प्री-डायबिटीज़।' } },
  { key: 'tsh', match: /\btsh\b|thyroid stimulating/i, what: { en: 'The signal that controls your thyroid gland.', hi: 'थायरॉइड ग्रंथि को नियंत्रित करने वाला संकेत।' }, high: { en: 'High TSH often means an underactive thyroid (tiredness, weight gain).', hi: 'ज़्यादा TSH अक्सर कम सक्रिय थायरॉइड दिखाता है (थकान, वज़न बढ़ना)।' }, low: { en: 'Low TSH can mean an overactive thyroid.', hi: 'कम TSH ज़्यादा सक्रिय थायरॉइड दिखा सकता है।' } },
  { key: 'creatinine', match: /\bcreatinine\b/i, what: { en: 'A waste product that shows how well the kidneys filter.', hi: 'एक अपशिष्ट जो बताता है कि किडनी कितना अच्छा छानती है।' }, high: { en: 'High creatinine can mean the kidneys are under strain. See a doctor.', hi: 'ज़्यादा क्रिएटिनिन किडनी पर दबाव दिखा सकता है। डॉक्टर को दिखाएँ।' }, urgent: { unit: /mg\s*\/\s*dl/i, above: 3 } },
  { key: 'urea', match: /\b(blood )?urea\b|\bbun\b/i, what: { en: 'Another kidney waste product.', hi: 'किडनी का एक और अपशिष्ट।' }, high: { en: 'Can rise with dehydration or kidney problems.', hi: 'पानी की कमी या किडनी की समस्या में बढ़ सकता है।' } },
  { key: 'cholesterol', match: /total cholesterol|\bcholesterol\b(?!.*(hdl|ldl))/i, what: { en: 'Total fat-like substance in the blood.', hi: 'खून में कुल वसा जैसा पदार्थ।' }, high: { en: 'High cholesterol raises heart risk over time. Diet, activity and sometimes medicine help.', hi: 'ज़्यादा कोलेस्ट्रॉल समय के साथ दिल का जोखिम बढ़ाता है। भोजन, व्यायाम और कभी दवा मदद करती है।' } },
  { key: 'ldl', match: /\bldl\b/i, what: { en: '"Bad" cholesterol that can build up in arteries.', hi: '"ख़राब" कोलेस्ट्रॉल जो नसों में जमा हो सकता है।' }, high: { en: 'Lower is better for the heart.', hi: 'दिल के लिए कम बेहतर है।' } },
  { key: 'hdl', match: /\bhdl\b/i, what: { en: '"Good" cholesterol that protects the heart.', hi: '"अच्छा" कोलेस्ट्रॉल जो दिल की रक्षा करता है।' }, low: { en: 'Low HDL adds to heart risk; activity helps raise it.', hi: 'कम HDL दिल का जोखिम बढ़ाता है; व्यायाम इसे बढ़ाने में मदद करता है।' } },
  { key: 'triglycerides', match: /triglyceride/i, what: { en: 'A type of fat in the blood.', hi: 'खून में एक प्रकार की वसा।' }, high: { en: 'Often rises with sugar, alcohol and refined carbohydrates.', hi: 'चीनी, शराब और मैदे से अक्सर बढ़ता है।' } },
  { key: 'alt', match: /\b(alt|sgpt)\b/i, what: { en: 'A liver enzyme.', hi: 'लिवर का एक एंज़ाइम।' }, high: { en: 'Raised levels can mean liver irritation from infection, fat, alcohol or medicines.', hi: 'बढ़ा स्तर संक्रमण, चर्बी, शराब या दवाओं से लिवर पर असर दिखा सकता है।' } },
  { key: 'ast', match: /\b(ast|sgot)\b/i, what: { en: 'An enzyme found in the liver and muscles.', hi: 'लिवर और मांसपेशियों में पाया जाने वाला एंज़ाइम।' }, high: { en: 'Raised levels can come from the liver or from muscle strain.', hi: 'बढ़ा स्तर लिवर या मांसपेशियों से हो सकता है।' } },
  { key: 'bilirubin', match: /bilirubin/i, what: { en: 'A yellow pigment processed by the liver.', hi: 'लिवर द्वारा संसाधित पीला रंग।' }, high: { en: 'High bilirubin causes yellow eyes (jaundice). See a doctor.', hi: 'ज़्यादा बिलीरुबिन से आँखें पीली होती हैं (पीलिया)। डॉक्टर को दिखाएँ।' } },
  { key: 'vitd', match: /vitamin\s*d|25.?oh/i, what: { en: 'Vitamin D, for bones and muscles.', hi: 'विटामिन D, हड्डियों और मांसपेशियों के लिए।' }, low: { en: 'Very common in India. Sunlight and supplements prescribed by a doctor help.', hi: 'भारत में बहुत आम। धूप और डॉक्टर की बताई दवा मदद करती है।' } },
  { key: 'b12', match: /vitamin\s*b\s*12|cobalamin/i, what: { en: 'Vitamin B12, for nerves and blood.', hi: 'विटामिन B12, नसों और खून के लिए।' }, low: { en: 'Common in vegetarian diets; can cause tiredness and tingling.', hi: 'शाकाहारी भोजन में आम; थकान और झुनझुनी हो सकती है।' } },
  { key: 'ferritin', match: /ferritin/i, what: { en: 'Your iron stores.', hi: 'शरीर में जमा आयरन।' }, low: { en: 'Low ferritin means iron stores are low.', hi: 'कम फ़ेरिटिन का मतलब है आयरन का भंडार कम है।' } },
  { key: 'uricAcid', match: /uric acid/i, what: { en: 'A waste product linked to gout.', hi: 'गठिया (गाउट) से जुड़ा एक अपशिष्ट।' }, high: { en: 'High levels can cause painful joints (gout).', hi: 'ज़्यादा स्तर से जोड़ों में दर्द (गाउट) हो सकता है।' } },
  { key: 'sodium', match: /\b(sodium|na\+?)\b/i, what: { en: 'A salt that keeps body fluids balanced.', hi: 'शरीर के तरल संतुलित रखने वाला नमक।' }, urgent: { unit: /m(m|e)q|mmol/i, below: 125, above: 155 } },
  { key: 'potassium', match: /\b(potassium|k\+?)\b/i, what: { en: 'A salt that keeps the heart rhythm steady.', hi: 'दिल की धड़कन स्थिर रखने वाला नमक।' }, urgent: { unit: /m(m|e)q|mmol/i, below: 3, above: 6 } },
];

export function findTest(name: string): LabTest | null {
  return LAB_TESTS.find((t) => t.match.test(name)) ?? null;
}

/** Reads a printed reference range: "13.0 - 17.0", "4,000–11,000", "< 200", "Up to 40", "> 40". */
export function parseRange(text: string | null | undefined): { low: number | null; high: number | null } | null {
  if (!text) return null;
  const t = text.replace(/,(?=\d{3})/g, '').replace(/[–—]/g, '-').toLowerCase();
  const num = '([0-9]+(?:\\.[0-9]+)?)';
  let m = t.match(new RegExp(`${num}\\s*-\\s*${num}`));
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  m = t.match(new RegExp(`(?:<|less than|up ?to|below)\\s*=?\\s*${num}`));
  if (m) return { low: null, high: Number(m[1]) };
  m = t.match(new RegExp(`(?:>|more than|above|greater than)\\s*=?\\s*${num}`));
  if (m) return { low: Number(m[1]), high: null };
  return null;
}

export type Flag = 'low' | 'high' | 'normal' | null;

/** Deterministic flag from the value and the printed range; null when either is not numeric. */
export function flagFor(value: string | number | null | undefined, range: { low: number | null; high: number | null } | null): Flag {
  const v = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').match(/-?[0-9]+(?:\.[0-9]+)?/)?.[0]);
  if (!range || !Number.isFinite(v)) return null;
  if (range.low !== null && v < range.low) return 'low';
  if (range.high !== null && v > range.high) return 'high';
  return 'normal';
}

/** True when a value is in a range that needs a doctor soon, checked only in the expected unit. */
export function isUrgent(test: LabTest | null, value: string | number | null | undefined, unit: string | null | undefined): boolean {
  if (!test?.urgent || !unit || !test.urgent.unit.test(unit)) return false;
  let v = Number(String(value ?? '').replace(/,/g, '').match(/-?[0-9]+(?:\.[0-9]+)?/)?.[0]);
  if (!Number.isFinite(v)) return false;
  // Platelets are printed in lakhs or thousands as often as per microlitre.
  if (test.key === 'platelets') v = /lakh/i.test(unit) ? v * 100000 : /10\^?3|10³/.test(unit) ? v * 1000 : v;
  return (test.urgent.below !== undefined && v < test.urgent.below) || (test.urgent.above !== undefined && v > test.urgent.above);
}

/**
 * Typical adult ranges, used only when the report's own range is not readable and the unit
 * matches. Labs differ, so the page says when a flag came from here.
 */
const TYPICAL: Record<string, { unit: RegExp; low: number | null; high: number | null }> = {
  hb: { unit: /g\s*\/\s*dl/i, low: 12, high: 17 },
  wbc: { unit: /(\/\s*(cumm|µl|ul|mm3)|cells)/i, low: 4000, high: 11000 },
  platelets: { unit: /lakh/i, low: 1.5, high: 4.1 },
  mcv: { unit: /fl/i, low: 80, high: 100 },
  esr: { unit: /mm/i, low: null, high: 20 },
  glucoseFasting: { unit: /mg\s*\/\s*dl/i, low: 70, high: 100 },
  glucose: { unit: /mg\s*\/\s*dl/i, low: 70, high: 140 },
  hba1c: { unit: /%/, low: null, high: 5.7 },
  tsh: { unit: /(µ|u|micro|m)iu/i, low: 0.4, high: 4.5 },
  creatinine: { unit: /mg\s*\/\s*dl/i, low: 0.6, high: 1.3 },
  urea: { unit: /mg\s*\/\s*dl/i, low: 15, high: 45 },
  cholesterol: { unit: /mg\s*\/\s*dl/i, low: null, high: 200 },
  ldl: { unit: /mg\s*\/\s*dl/i, low: null, high: 130 },
  hdl: { unit: /mg\s*\/\s*dl/i, low: 40, high: null },
  triglycerides: { unit: /mg\s*\/\s*dl/i, low: null, high: 150 },
  alt: { unit: /(u|iu)\s*\/\s*l/i, low: null, high: 45 },
  ast: { unit: /(u|iu)\s*\/\s*l/i, low: null, high: 40 },
  bilirubin: { unit: /mg\s*\/\s*dl/i, low: null, high: 1.2 },
  vitd: { unit: /ng\s*\/\s*ml/i, low: 30, high: 100 },
  b12: { unit: /pg\s*\/\s*ml/i, low: 200, high: 900 },
  uricAcid: { unit: /mg\s*\/\s*dl/i, low: 3.5, high: 7.2 },
  sodium: { unit: /m(m|e)q|mmol/i, low: 135, high: 145 },
  potassium: { unit: /m(m|e)q|mmol/i, low: 3.5, high: 5.1 },
};

export function typicalRange(test: LabTest | null, unit: string | null | undefined): { low: number | null; high: number | null } | null {
  const t = test ? TYPICAL[test.key] : undefined;
  return t && unit && t.unit.test(unit) ? { low: t.low, high: t.high } : null;
}
