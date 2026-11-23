/**
 * Common Indian medicine brands and the salts they contain. Built-in knowledge so a brand-only
 * prescription line ("Dolo 650", "Pan-D") or a strip with a hidden composition can still be
 * matched to its generic without another AI call. Salts only: the strength always comes from what
 * is written or printed, because one brand is sold in several strengths.
 */
const BRANDS: Record<string, string> = {
  // Pain, fever
  dolo: 'Paracetamol', crocin: 'Paracetamol', calpol: 'Paracetamol', pacimol: 'Paracetamol',
  combiflam: 'Ibuprofen + Paracetamol', brufen: 'Ibuprofen', ibugesic: 'Ibuprofen',
  zerodol: 'Aceclofenac', hifenac: 'Aceclofenac', zerodolp: 'Aceclofenac + Paracetamol', hifenacp: 'Aceclofenac + Paracetamol',
  zerodolsp: 'Aceclofenac + Paracetamol + Serratiopeptidase', voveran: 'Diclofenac', dynapar: 'Diclofenac',
  meftal: 'Mefenamic Acid', meftalspas: 'Mefenamic Acid + Dicyclomine', ultracet: 'Tramadol + Paracetamol',
  disprin: 'Aspirin', nise: 'Nimesulide', nimulid: 'Nimesulide',
  // Stomach
  pan: 'Pantoprazole', pantop: 'Pantoprazole', pantocid: 'Pantoprazole', pand: 'Pantoprazole + Domperidone', pantocidd: 'Pantoprazole + Domperidone',
  omez: 'Omeprazole', omezd: 'Omeprazole + Domperidone', razo: 'Rabeprazole', rablet: 'Rabeprazole', razod: 'Rabeprazole + Domperidone',
  nexpro: 'Esomeprazole', rantac: 'Ranitidine', aciloc: 'Ranitidine', famocid: 'Famotidine',
  ondem: 'Ondansetron', emeset: 'Ondansetron', vomikind: 'Ondansetron', domstal: 'Domperidone',
  cyclopam: 'Dicyclomine + Paracetamol', drotin: 'Drotaverine', duphalac: 'Lactulose', udiliv: 'Ursodeoxycholic Acid',
  // Allergy, cough, asthma
  cetzine: 'Cetirizine', okacet: 'Cetirizine', alerid: 'Cetirizine', zyrtec: 'Cetirizine',
  levocet: 'Levocetirizine', xyzal: 'Levocetirizine', teczine: 'Levocetirizine', allegra: 'Fexofenadine', avil: 'Pheniramine', atarax: 'Hydroxyzine',
  montair: 'Montelukast', montek: 'Montelukast', romilast: 'Montelukast',
  montairlc: 'Montelukast + Levocetirizine', monteklc: 'Montelukast + Levocetirizine', allegram: 'Fexofenadine + Montelukast',
  ascorills: 'Ambroxol + Levosalbutamol + Guaifenesin', mucinac: 'Acetylcysteine',
  asthalin: 'Salbutamol', budecort: 'Budesonide', foracort: 'Formoterol + Budesonide', seroflo: 'Salmeterol + Fluticasone', deriphyllin: 'Etofylline + Theophylline',
  // Antibiotics, antifungal, worms
  azithral: 'Azithromycin', azee: 'Azithromycin', zithromax: 'Azithromycin',
  augmentin: 'Amoxicillin + Clavulanic Acid', clavam: 'Amoxicillin + Clavulanic Acid', moxclav: 'Amoxicillin + Clavulanic Acid', amoxyclav: 'Amoxicillin + Clavulanic Acid',
  mox: 'Amoxicillin', novamox: 'Amoxicillin', taxim: 'Cefixime', taximo: 'Cefixime', zifi: 'Cefixime', cefix: 'Cefixime', monocef: 'Ceftriaxone',
  cifran: 'Ciprofloxacin', ciplox: 'Ciprofloxacin', cifrantz: 'Ciprofloxacin + Tinidazole', cifloxtz: 'Ciprofloxacin + Tinidazole',
  oflox: 'Ofloxacin', zanocin: 'Ofloxacin', o: 'Ofloxacin + Ornidazole', levoflox: 'Levofloxacin', norflox: 'Norfloxacin', norfloxtz: 'Norfloxacin + Tinidazole',
  metrogyl: 'Metronidazole', flagyl: 'Metronidazole', doxt: 'Doxycycline',
  forcan: 'Fluconazole', zocon: 'Fluconazole', zentel: 'Albendazole', bandy: 'Albendazole',
  // Diabetes
  glycomet: 'Metformin', glyciphage: 'Metformin', gluconorm: 'Metformin', obimet: 'Metformin',
  glycometgp: 'Glimepiride + Metformin', amaryl: 'Glimepiride', amarylm: 'Glimepiride + Metformin', gemer: 'Glimepiride + Metformin',
  januvia: 'Sitagliptin', istavel: 'Sitagliptin', janumet: 'Sitagliptin + Metformin', istamet: 'Sitagliptin + Metformin',
  galvus: 'Vildagliptin', jalra: 'Vildagliptin', galvusmet: 'Vildagliptin + Metformin', jalram: 'Vildagliptin + Metformin',
  // Heart, blood pressure, cholesterol
  telma: 'Telmisartan', telmah: 'Telmisartan + Hydrochlorothiazide', telmaam: 'Telmisartan + Amlodipine', telmisartan: 'Telmisartan',
  amlong: 'Amlodipine', amlopres: 'Amlodipine', amlopress: 'Amlodipine', stamlo: 'Amlodipine', amlokind: 'Amlodipine',
  losar: 'Losartan', repace: 'Losartan', losarh: 'Losartan + Hydrochlorothiazide', cilacar: 'Cilnidipine', nicardia: 'Nifedipine',
  concor: 'Bisoprolol', metxl: 'Metoprolol', metolar: 'Metoprolol', aten: 'Atenolol', tenormin: 'Atenolol', cardivas: 'Carvedilol', arkamin: 'Clonidine',
  ecosprin: 'Aspirin', ecosprinav: 'Aspirin + Atorvastatin', clopilet: 'Clopidogrel', plavix: 'Clopidogrel', deplatt: 'Clopidogrel',
  atorva: 'Atorvastatin', lipitor: 'Atorvastatin', storvas: 'Atorvastatin', tonact: 'Atorvastatin', rosuvas: 'Rosuvastatin', rozavel: 'Rosuvastatin', crestor: 'Rosuvastatin',
  lasix: 'Furosemide', dytor: 'Torsemide', aldactone: 'Spironolactone', sorbitrate: 'Isosorbide Dinitrate',
  // Thyroid, steroids, vitamins
  thyronorm: 'Levothyroxine', eltroxin: 'Levothyroxine', thyrox: 'Levothyroxine',
  wysolone: 'Prednisolone', omnacortil: 'Prednisolone', dexona: 'Dexamethasone', medrol: 'Methylprednisolone',
  shelcal: 'Calcium Carbonate + Vitamin D3', calcimax: 'Calcium Carbonate + Vitamin D3', folvite: 'Folic Acid', limcee: 'Ascorbic Acid', uprise: 'Cholecalciferol', calcirol: 'Cholecalciferol',
  // Brain, nerves, sleep
  alprax: 'Alprazolam', restyl: 'Alprazolam', ativan: 'Lorazepam', clonotril: 'Clonazepam', rivotril: 'Clonazepam',
  nexito: 'Escitalopram', stalopam: 'Escitalopram', pregeb: 'Pregabalin', lyrica: 'Pregabalin', gabapin: 'Gabapentin',
  eptoin: 'Phenytoin', levipil: 'Levetiracetam', levera: 'Levetiracetam', tegretol: 'Carbamazepine', valparin: 'Sodium Valproate',
  vertin: 'Betahistine', stemetil: 'Prochlorperazine',
  // Gout
  zyloric: 'Allopurinol', febuget: 'Febuxostat', feburic: 'Febuxostat',
};

/** "Tab. Pan-D 40", "DOLO 650 mg", "Montair LC" -> lookup key "pand", "dolo", "montairlc". */
export function brandKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\s*(tab|tablet|cap|capsule|syp|syrup|inj|injection|susp|suspension|oint|drops?)\b\.?\s*/, '')
    .replace(/\b(forte|plus|tablets?|capsules?|mg|ml|mcg|er|sr|xr|od)\b/g, '')
    .replace(/[^a-z]/g, '');
}

/** The salts in a brand, or null if it is not in the built-in list. Single letters never match. */
export function saltsFor(name: string): string | null {
  const key = brandKey(name);
  if (key.length < 2 && key !== 'o') return null;
  // "O2" is the only one-letter brand worth knowing, and only with its digit.
  if (key === 'o' && !/\bo\s*2\b/i.test(name)) return null;
  return BRANDS[key] ?? null;
}

export const BRAND_COUNT = Object.keys(BRANDS).length;
