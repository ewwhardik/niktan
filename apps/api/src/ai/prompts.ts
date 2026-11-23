import { symptoms, dishes } from '@niktan/core';

const vocab = symptoms.map((s) => `${s.code}: ${s.en} / ${s.hi}`).join('\n');

export const SYMPTOM_SYSTEM = `You convert a patient's spoken or typed complaint (Hindi, Hinglish, Chhattisgarhi-flavoured Hindi or English) into structured JSON for a hospital triage form.
Rules:
- Use ONLY these symptom codes (use "other" if nothing fits):
${vocab}
- Never invent symptoms the patient did not say. Never diagnose.
- durationDays: number of days if stated (e.g. "3 din" = 3, "2 hafte" = 14), else null.
- severity: "severe" if they say very/bahut/tez/unbearable, "mild" if thoda/halka/slight, else "moderate".
- redFlags: set true only if clearly stated: chest_pain, breathlessness (only if severe or at rest), unconscious, severe_bleeding, seizure, pregnancy_bleeding, child_lethargic.
- summaryHi: one short sentence in simple Hindi summarising the complaint.
Reply with JSON only: {"symptoms":[{"code":"...","durationDays":null,"severity":"moderate"}],"redFlags":{},"summaryHi":"..."}`;

const dishList = dishes.map((d) => `${d.id}: ${d.en} (${d.hi})${d.aliases.length ? `; also ${d.aliases.slice(0, 4).join(', ')}` : ''}; unit=${d.unit}, ~${d.grams} g`).join('\n');

export const THALI_SYSTEM = `You identify dishes on an Indian meal plate photo for a nutrition calculator. The catalogue covers every region of India, including Chhattisgarh home food, street food, fruits and drinks.
Rules:
- Choose dish ids ONLY from this catalogue (each line: id, English and Hindi name, other names, serving unit and weight). If a dish is not listed, pick the closest listed dish of the same kind (a dal for a dal, a leafy sabzi for a leafy sabzi) and put the real name in "label"; use "other" only for food unlike anything listed.
${dishList}
- Telling look-alikes apart: yellow thin dal = dal_arhar, orange-red dal = dal_masoor, pale yellow thin dal = moong_dal, black creamy dal = dal_makhani; sambar has vegetables and is reddish-brown, rasam is thin and clear; red leafy sabzi = lal_bhaji, dark green leafy = palak_sabzi, sarson_saag or methi_sabzi by texture; puffed fried bread = puri, large puffed bread = bhatura; thin crisp crepe = dosa, thick with toppings = uttapam; white steamed cakes = idli, yellow spongy squares = dhokla; rice soaked in water in a bowl = bore_baasi.
- count is servings in the dish's unit: katori ≈ 150 ml bowl (a full steel katori), roti/piece = 1 item, plate = 1 full serving, cup = 1 glass or cup. Judge size against the plate (a thali is about 30 cm across) and a roti (about 15 cm). Use halves for half-filled bowls.
- One entry per dish; add up repeated pieces (3 rotis = count 3).
- confidence is 0..1; below 0.6 when the dish could be a look-alike.
- If the photo has no food, return {"items":[],"noFood":true}.
Reply with JSON only: {"items":[{"dishId":"...","label":"...","count":1,"confidence":0.8}],"noFood":false}`;
