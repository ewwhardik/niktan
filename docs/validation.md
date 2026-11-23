# Problem Validation & Clinical Rationale

> **Track:** Hackasol 5.0 · Open Innovation (OI-01)  
> **Project:** NikTan (निकतन)  
> **Core Hypothesis:** Government OPD wait times can be dramatically reduced and clinical consultation quality improved by shifting preliminary vitals screening, symptom structuring, and triage prioritization onto the patient's own phone *before* they enter the consultation room.

---

## 1. The Real-World Crisis in Public Hospital OPDs

In Indian government district hospitals and medical college outpatient departments (OPDs):
1. **Disproportionate Wait-to-Consult Ratio:**
   - A peer-reviewed study in a North Indian government teaching hospital of 255 outpatients revealed an average wait of **242.8 minutes** from arrival until the physician called the patient, against an average consultation duration of just **12.8 minutes** (*International Journal of Community Medicine and Public Health*, [DOI: 10.18203/2394-6040.ijcmph202416572](https://www.ijcmph.com/index.php/ijcmph/article/view/16572)).
   - In tertiary neurology OPDs, a mean wait of **110.9 minutes** for a **5.3-minute** consultation has been reported (neurology OPD time-motion study; see README sources).
   - Tertiary institutions like AIIMS Delhi manage **14,000 to 15,000 OPD visits per day** (over 50 lakh visits annually).
2. **First-Come, First-Served Bottleneck:**
   - Conventional outpatient queues operate purely on arrival order. A breathless hypertensive patient or an anemic pregnant woman in silent distress waits behind ten routine dermatological follow-ups.
3. **Wasted Physician Bandwidth:**
   - Doctors spend an estimated 40% to 60% of their critical 5-minute consultation (estimate, to be verified) on repetitive baseline history-taking ("What is bothering you? How many days? Do you have fever or chest pain?") and taking manual vitals, rather than examining and prescribing.
4. **Undiagnosed Silent Morbidities:**
   - Nutritional anemia affects over 50% of Indian women (NFHS-5), uncorrected refractive errors impede productivity, and early cataract or progressive sensorineural hearing loss go unnoticed until advanced.

---

## 2. Where NikTan Fits: Completing the ABDM Vision

India's **Ayushman Bharat Digital Mission (ABDM)** introduced **Scan & Share** (QR-code based ABHA token generation), which achieved massive success:
- Over **23.21 crore digital tokens** generated across thousands of hospitals.
- Registration queue times slashed from **~60 minutes down to 2–5 minutes** ([PIB MoHFW Report 2026](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2281466)).

**The Critical Unaddressed Gap:**  
ABDM Scan & Share successfully solved *administrative registration*, but created a new bottleneck directly outside the doctor's cabin. Once registered, patients enter a single, un-triaged, first-come queue with zero clinical information attached.

```
[ Traditional Flow ]
ABDM Scan & Share (Registration) ──► 2-4 hr Blind OPD Wait ──► 5 min Consult (History + Vitals consumed)

[ NikTan Flow ]
ABDM Scan & Share ──► NikTan 3-Min Phone Screening ──► Priority-Triaged Queue ──► Data-Rich Pre-Consult
                      • rPPG Heart Rate               • 🔴 Emergency bypass       • Physician begins with
                      • Conjunctival Pallor           • 🟠 See Today triage         structured history,
                      • Calibrated Tumbling-E         • 🟢 Routine queue            vitals, & alerts
                      • Digits-in-Noise Hearing
                      • Voice Symptom Structuring
```

---

## 3. Planned validation (not yet done)

No field observations or interviews have been carried out yet. The team plans the following steps; the results will be added here once they are done.

1. **Survey:** a survey of 30+ people on OPD waiting times and on the pain points this project targets.
2. **OPD observation:** a 1–2 hour observation visit to a government OPD, carried out only with consent from the hospital and from the people observed.
3. **Recorded quotes:** 3 quotes from patients and OPD staff, recorded with consent. The team will fill these in after the visits:
   - Quote 1: *[to be filled in by the team]*
   - Quote 2: *[to be filled in by the team]*
   - Quote 3: *[to be filled in by the team]*

---

## 4. Ethical & Medical Boundary Principles

1. **Screening vs. Diagnosis:**  
   NikTan is explicitly an assistive pre-consultation triage tool. It **never diagnoses**. Every finding is phrased as a risk tier or prompt for confirmatory testing (e.g., *"Pallor detected: consider confirmatory complete blood count / Hb test"*).
2. **Emergency Protocol (Fail-Safe):**  
   Any confirmed red-flag symptom (acute chest pain, respiratory distress, active obstetrical hemorrhage, altered consciousness) instantly short-circuits the OPD flow, overrides the queue, and presents a direct one-tap emergency banner (`tel:108` and *"Proceed to Emergency Department immediately"*).
3. **Zero-Knowledge On-Device Privacy:**  
   Face video streams and ocular macrolens photos are processed exclusively inside the browser's WebAssembly sandbox. Raw biometric frames never leave the patient's device, designed to align with India's **Digital Personal Data Protection (DPDP) Act 2023**.
