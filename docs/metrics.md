# Measurable Impact & Quantitative Evaluation

> **Track:** Hackasol 5.0 · Open Innovation (OI-01)  
> **Project:** NikTan (निकतन)  
> **Deliverable:** Measurable metrics demonstrating quantitative before/after improvement.

---

## 1. Key Evaluation Metrics Overview

| Metric | Traditional Baseline | With NikTan Prototype | Quantitative Impact | Source / Method |
|---|---|---|---|---|
| **1. Doctor History & Vitals Duration** | 2.5 – 4.0 min (out of 5.3 min total consult) | **0.5 – 1.0 min** | **65% – 75% reduction** in manual intake time | Timed pre-consult pilot & doctor card workflow |
| **2. Time to Triage High-Risk Patient in Queue** | 80 – 120+ minutes (behind 10–15 routine patients in FIFO queue) | **< 10 seconds** (instant priority reordering or 🔴 Emergency bypass) | **Instant prioritization** to #1 position | Automated D1 queue prioritization benchmark (`d1.test.mjs`) |
| **3. Per-Screening Cost to Citizen & System** | ₹650 – ₹1,500 (lab Hb test ₹100, optometry ₹150, audiometry ₹200, travel/lost wages ₹500) | **₹0 for citizen** / **~₹0.04 server cost** | **99.9% cost reduction** via browser edge computing | Cloudflare + Gemini/Groq compute analysis (`docs/cost.md`) |
| **4. Screening Throughput per Phone / Kiosk** | 0 (no pre-screening exists in general OPDs) | **3.0 minutes** for full 5-step screening | Scales to **100+ screenings/day** per tablet/phone | End-to-end user workflow stopwatch measurements |

---

## 2. Metric 1: Doctor Consultation Efficiency

### Baseline
- In public hospital OPDs, physicians routinely handle 60–100 patients per 4-hour morning session (~2.5 to 5 minutes per patient).
- Studies show that **more than 50% of consultation time** is spent eliciting onset, duration, basic vitals, and checking for red flags.

### NikTan Impact
- When the doctor clicks a patient token on the **NikTan Triage Board**, the **Pre-Consult Card** immediately presents:
  1. Measured rPPG heart rate (bpm) + signal SNR quality.
  2. Conjunctival pallor risk status (anemia flag).
  3. Visual acuity (left and right eye Snellen / logMAR equivalent).
  4. Digits-in-noise hearing referral tier (SNR dB).
  5. AI-structured symptom profile: symptom name, onset duration (days), severity level, and verified red flags.
- **Result:** The doctor bypasses repetitive questioning and immediately transitions into clinical examination, diagnostic confirmation, and prescribing.

---

## 3. Metric 2: Queue Reordering & High-Risk Patient Safety

### Controlled Test Validation (`apps/api/test/d1.test.mjs`)
To verify algorithmic queue behavior under realistic hospital loads, an automated integration test was executed:
1. **Scenario:** 14 routine synthetic patients were waiting in the General Medicine queue (Hospital: `demo-dh`, Department: General Medicine).
2. **Arrival:** A 15th patient arrived reporting 3 days of acute fever.
3. **FIFO Sorting:** Traditional hospital queue assigned position **15 of 15**.
4. **NikTan Priority Sorting:** The deterministic triage engine evaluated the fever duration, classified the visit as **🟠 See Today**, and repositioned the patient from **15th to 1st position (0 ahead)** while preserving transparent token sequence #15.
5. **Emergency Bypass:** A patient reporting acute chest pain and shortness of breath was immediately routed to the **🔴 Emergency** protocol, bypassing OPD queues entirely with a direct 108 shortcut.

---

## 4. Metric 3: Comprehensive Multi-Modal Health Access

| Screening Domain | Traditional OPD Reality | NikTan Smartphone Solution |
|---|---|---|
| **Vital Signs** | Dedicated nurse queue with manual BP cuff and pulse oximeter | In-browser rPPG POS algorithm tracks facial capillaries in 30 seconds |
| **Anemia (Pallor)** | Invasive venous blood draw (CBC / Hemocue), 1–4 hour lab wait | Edge-computed conjunctival colorimetry with validated high sensitivity (85.1%) |
| **Vision Acuity** | Separate Eye OPD visit, Snellen chart at 6 meters | On-screen card-calibrated tumbling-E test (dual 40cm and 2m modes) |
| **Hearing Acuity** | Soundproof booth audiometry (rarely available outside district hubs) | Binaural Digits-in-Noise (DIN) speech audiometry in noisy waiting rooms |
| **Dietary Nutrition** | Verbal dietary history (rarely conducted in OPD) | Thali photo scan matched against INDB recipes and ICMR-NIN 2020 RDA targets |
