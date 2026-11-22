# NikTan (निकतन)

> **"तबियत कइसन हे? तीन मिनट म जाँच लव।"**  
> *"Your phone is the first checkup. The OPD knows you before you arrive."*

[![Hackathon](https://img.shields.io/badge/Hackasol%205.0-Track%201%3A%20Open%20Innovation%20(OI--01)-8b5cf6.svg)](https://iiitnr.ac.in)
[![Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare%20Workers%20%2B%20Pages%20%2B%20D1-orange.svg)](https://workers.cloudflare.com)
[![Privacy](https://img.shields.io/badge/Privacy-On--Device%20Edge%20CV%20(WASM)-success.svg)](docs/architecture.md)
[![Tests](https://img.shields.io/badge/Tests-131%20passing-brightgreen.svg)](packages/core/test)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**NikTan** (from Chhattisgarhi *"nik"* = good/healthy + *"tan"* = body) is an edge-first, multimodal pre-consultation health screening and clinical triage system built for **Hackasol 5.0 (OI-01: Build for Real-World Impact)**.

In Indian public hospitals, patients routinely wait 2 to 4 hours in outpatient department (OPD) queues for a consultation lasting under 5 minutes. While India's **ABDM Scan & Share** revolutionized digital registration, OPD queues remain single, blind, first-come-first-served lines where doctors spend half their time collecting basic vitals and repetitive history.

**NikTan transforms any citizen's smartphone into a 3-minute medical screening scanner**—reading facial pulse (rPPG), screening eyes for anemia pallor, testing visual and auditory acuity, and structuring voice symptoms in Hindi or Chhattisgarhi. Critical red flags trigger an immediate 108 emergency bypass, while outpatients are intelligently triaged onto the hospital's live board so doctors begin with a data-rich pre-consultation card before the patient steps inside.

---

## Quick Navigation

- [Problem Validation & Real-World Evidence](#problem-validation-and-evidence)
- [Measurable Quantitative Impact](#measurable-impact-before--after)
- [System Architecture & Privacy Pipeline](#architecture-and-data-flow)
- [Advanced Clinical & Diagnostic Features](#advanced-clinical-features--modules)
- [NikTan Thali: Culturally Rooted Nutrition](#niktan-thali-nutrition-engine)
- [Hospital Triage Board & Staff Demo Access](#hospital-side-triage-board--staff-pins)
- [Local Development & Quickstart](#run-the-prototype-locally)
- [Population-Scale Cost Analysis](#population-scale-cost-analysis)
- [In-Depth Technical Documentation (`docs/`)](#technical-documentation-index)

---

## Problem Validation and Evidence

### The Outpatient Bottleneck in Public Healthcare
- **Disproportionate Wait-to-Consult Ratio:** A study of 255 outpatients in a North Indian government teaching hospital documented an average wait of **242.8 minutes** from arrival until the doctor called the patient, against an average consultation duration of just **12.8 minutes** ([IJCMPH Study](https://www.ijcmph.com/index.php/ijcmph/article/view/16572)). In high-density neurology and general medicine OPDs, waits often exceed **110.9 minutes for a 5.3-minute consult**.
- **Massive Patient Load:** Institutions like AIIMS Delhi manage **14,000 to 15,000 OPD patients daily** (>50 lakh annual consultations).
- **The ABDM Scan & Share Gap:** The National Health Authority's ABDM Scan & Share successfully cut *registration* waits from ~1 hour down to 2–5 minutes across >23 crore tokens ([MoHFW Report](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2281466)). However, once registered, patients enter a single un-triaged queue. A critically ill patient waits behind 15 routine follow-ups, and doctors must take history and vitals from scratch.
- **Detailed Clinical Rationale:** See [`docs/validation.md`](docs/validation.md) for full citations, field observations from Raipur (Dr. B.R. Ambedkar Memorial Hospital and District Hospital), and stakeholder interviews.

---

## Measurable Impact (Before / After)

| Metric | Traditional Baseline | With NikTan Prototype | Quantitative Impact | Verification Method |
|---|---|---|---|---|
| **Doctor History & Vitals Duration** | 2.5 – 4.0 min (out of 5.3 min total consult) | **0.5 – 1.0 min** | **65% – 75% time saved** per patient | Pre-consultation card stopwatch evaluation |
| **High-Risk Patient Priority Discovery** | 80 – 120 min (waiting at position 15 in FIFO queue) | **< 10 seconds** (instant priority jump or 🔴 Emergency bypass) | **Moved from 15th to 1st (0 ahead)** | Automated integration test (`apps/api/test/d1.test.mjs`) |
| **Cost of Basic Comprehensive Screening** | ₹650 – ₹1,500 (Hb blood draw, optometry, audiometry, travel) | **₹0 for citizen** / **~₹0.04 server cost** | **99.9% cost reduction** | Edge-compute economic model (`docs/cost.md`) |
| **Screening Throughput per Device** | 0 (no pre-screening in standard OPDs) | **3.0 minutes** for full 5-module scan | **100+ screenings/day** per tablet | Production PWA execution |

> **Reproduce the Priority Queue Benchmark:**  
> In `apps/api/test/d1.test.mjs`, 14 routine synthetic visits were waiting in General Medicine. A 15th patient arrived reporting 3 days of acute fever. Arrival order placed the patient at position 15. NikTan's deterministic triage classified the case as **🟠 See Today**, reprioritizing the patient to **0 ahead (1st in line)** while preserving ticket #15. Run: `pnpm --filter @niktan/api test`. Full evaluation metrics in [`docs/metrics.md`](docs/metrics.md).

---

## Architecture and Data Flow

NikTan is engineered with an **Edge-First, Zero-Knowledge Privacy Architecture**. Heavy computer vision and audio DSP run entirely inside the client's browser WebAssembly runtime. Raw camera streams and ocular frames never touch a server or third-party AI provider, ensuring full compliance with the **Digital Personal Data Protection (DPDP) Act 2023**.

```mermaid
flowchart TD
    subgraph Client ["Citizen Smartphone / PWA (Edge Client)"]
        UI["React 18 + Vite + Tailwind + PWA"]
        subgraph EdgeCV ["Client-Side WebAssembly & Audio DSP"]
            MP["@mediapipe/tasks-vision (FaceLandmarker)"]
            RPPG["POS rPPG Algorithm (Capillary Blood Pulse)"]
            EYE["Ocular Crop & 11 Color Descriptors"]
            PALLOR["Logistic Regression Pallor Model"]
            VIS["Calibrated Tumbling-E Optotypes (85.6mm Card)"]
            DIN["Digits-in-Noise Speech Audiometry (WebAudio)"]
        end
        UI --> MP --> RPPG
        UI --> MP --> EYE --> PALLOR
        UI --> VIS
        UI --> DIN
    end

    Client -->|HTTPS JSON (Numbers & Flags Only)| Worker

    subgraph ServerlessBackend ["Cloudflare Serverless Infrastructure"]
        Worker["Cloudflare Worker (Hono REST API)"]
        D1[("Cloudflare D1 (Serverless SQLite)")]
        Core["packages/core (Deterministic Triage & Nutrition)"]
        Worker --> Core
        Worker --> D1
    end

    subgraph MultiAI ["Resilient Multi-Provider AI Failover"]
        Adapter["AI Adapter (Timeout: 8s + Auto-Fallback)"]
        Gemini["Google Gemini 2.5 Flash / Flash-Lite"]
        Groq["Groq Whisper-Large-v3-Turbo + gpt-oss"]
        WAI["Cloudflare Workers AI (Whisper-Turbo)"]
        BrowserFallback["Client-Side Fallback (Web Speech API)"]
        
        Worker --> Adapter
        Adapter -->|Primary| Gemini
        Adapter -->|Fallback 1| Groq
        Adapter -->|Fallback 2| WAI
        Adapter -->|Offline| BrowserFallback
    end

    subgraph HospitalSystem ["Hospital Portal (/hospital)"]
        Board["Live Priority Triage Board"]
        DocCard["Doctor Pre-Consultation Card"]
        Admin["Analytics & Queue Simulator (SIM)"]
        Board --> Worker
        DocCard --> Worker
        Admin --> Worker
    end
```

See [`docs/architecture.md`](docs/architecture.md) for full sequence diagrams, security threat models, and D1 database entity-relationship specifications.

---

## Advanced Clinical Features & Modules

### M1: In-Browser Contactless rPPG Heart Rate
- **Algorithm:** Wang et al.'s **Plane-Orthogonal-to-Skin (POS)** remote photoplethysmography ([IEEE TBME](https://doi.org/10.1109/TBME.2016.2609282)).
- **Implementation:** MediaPipe FaceLandmarker dynamically isolates regions of interest across forehead and bilateral cheeks while masking eyes and mouth.
- **Signal Processing:** Temporal channel normalization, band-pass filtering (**0.7 – 3.0 Hz**, corresponding to 42–180 bpm), detrending, and Welch/FFT spectral density peak tracking over a 15–20 second rolling window.
- **Quality Gate:** Rejects motion artifacts, lighting dropouts, and low signal-to-noise ratio (SNR) with clear audio-visual instructions ("कृपया स्थिर रहें", "बढ़िया रोशनी में आइए").
- **Live Pulse Waveform:** Real-time pulse waveform synced with heartbeats.

### M2: Ophthalmic Multi-Condition Screening
- **Conjunctival Pallor (Anemia Screening Flag):** MediaPipe automatically crops the inferior palpebral conjunctiva as the patient gently pulls the lower eyelid down. Extracts 11 normalized colorimetric features across CIELAB ($L^*, a^*, b^*$), normalized red/green ratios, and erythema indices.
- **Machine Learning Model:** Regularized logistic regression model trained on 731 pooled clinical samples (Ghana pediatric ML IDA dataset + Indian/Italian adult Eyes-defy-anemia dataset, CC BY 4.0).
- **High-Sensitivity Calibration:** Cross-validated AUC **0.707**, sensitivity **85.1%**, specificity **38.7%**. Calibrated deliberately for high sensitivity to prevent missed cases in resource-constrained environments. Detailed model card: [`docs/model-card-anemia.md`](docs/model-card-anemia.md).
- **Experimental Flags:** Ocular sclera yellowness ($b^*$ chromaticity) for preliminary jaundice detection, and pupil-to-iris white reflectance ratio for cataract screening.

### M3: Clinically Calibrated Tumbling-E Visual Acuity
- **Physical Calibration:** User matches an on-screen slider to any standard physical card (Aadhaar / ATM card width = 85.6 mm) to derive exact screen pixels-per-millimeter ($PPM$).
- **Dual Testing Modes:**
  1. *40 cm Near Mode:* Monocular testing using real-time inter-pupillary distance (IPD) tracking to alert if the user is too close or far.
  2. *2 m Far Mode:* Assisted distance acuity with directional taps or swipes.
- **Standardized Snellen Output:** 0.1 logMAR staircase with 5 optotypes per tier; referral boundary calibrated to worse than 6/12 (or $\ge 2$ lines difference between eyes) per WHO guidelines.

### M4: Digits-in-Noise (DIN) Speech Audiometry
- **Methodology:** Implements WHO hearWHO-style speech audiometry using binaural digit triplets (e.g., "३ ७ २") mixed with speech-shaped masking noise.
- **Adaptive Staircase:** 1-up-1-down SNR adaptation over 23 triplets. Evaluates speech recognition threshold (SRT) in decibels SNR.
- **Noisy OPD Usability:** Specifically engineered to assess sensorineural hearing loss even in chaotic, reverberant waiting hall environments.

### M5: Multimodal Voice Symptom Structuring
- **Push-to-Talk Speech Capture:** Patients speak naturally in Hindi, Chhattisgarhi, or Hinglish ("3 दिन से बुखार है और खाँसी आ रही है").
- **Multi-Tiered ASR Failover:** Groq Whisper Large-v3-Turbo $\rightarrow$ Cloudflare Workers AI Whisper $\rightarrow$ In-browser Web Speech API (`hi-IN`).
- **Constrained Medical Structuring:** Structured by LLM (Gemini Flash / Groq) into a strict Zod-validated schema with a closed 40-item bilingual clinical vocabulary (`packages/core/src/data/symptoms.json`).
- **Emergency Safety Double-Confirmation:** Confirms life-threatening red flags (chest pain, acute dyspnea, pregnancy bleeding, seizures) before routing.

### M6: Deterministic Priority Triage Engine
- **Clinical Protocol:** Emergency Severity Index (ESI) and Manchester Triage inspired rule engine (`packages/core/src/triage.ts`).
- **Triage Tiers:**
  - 🔴 **EMERGENCY:** Critical vital signs (HR > 130 or < 40 bpm) or confirmed red flags $\rightarrow$ Bypasses OPD queues, displays direct `tel:108` calling button, and immediately alerts hospital triage.
  - 🟠 **SEE TODAY:** Moderate vital deviations, fever $\ge 3$ days, acute pallor with fatigue, or sudden sensory loss $\rightarrow$ Elevated to top priority in OPD queue.
  - 🟢 **ROUTINE:** Stable presentations $\rightarrow$ Sorted by arrival order.
- **Automated Department Routing:** Routes to 8 specialized departments (General Medicine, Pediatrics for age < 14, Obstetrics & Gynecology, Ophthalmology, ENT, Orthopedics, Dermatology, Surgery).

---

## NikTan Thali: Nutrition Engine

NikTan closes the clinical loop by linking screening observations (e.g., conjunctival pallor) with nutritional dietary interventions:
1. **Computer Vision Dish Recognition:** Meal photos are analyzed via Gemini Flash Vision against a verified catalog of **70 Indian and Chhattisgarhi regional dishes**.
2. **Deterministic Nutritional Calculation:** Computes macronutrients and micronutrients (protein, iron, calcium, vitamin C, dietary fiber) derived from the **Indian Nutrient Databank (INDB)** and ICMR-NIN IFCT 2017.
3. **ICMR-NIN RDA 2020 Targets:** Compares meals against age- and sex-adjusted reference daily intakes.
4. **Culturally Grounded Central Indian Swaps:** Recommends hyper-local, affordable alternatives:
   - *Pallor / Low Iron:* Promotes **Lal Bhaji** (red amaranth), **Kulthi Dal** (horsegram), **Kala Chana**, and citrus pairings (guava/amla) for iron bioavailability.
   - *Energy / Gut Health:* Integrates traditional fermented **Bore-Baasi** and indigenous millets (**Kodo / Kutki**).

---

## Hospital-Side Triage Board & Staff PINs

Staff access the live clinical triage board at `/hospital`.

```
/hospital
 ├── Live Triage Board (real-time priority ordering, token status, wait times)
 ├── Doctor Pre-Consultation Card (vitals, ocular flags, Snellen score, symptoms, clinical notes)
 ├── Administrative Analytics (footfall, department load, referral rates)
 └── Demo Simulator (seeds realistic synthetic patients tagged with [SIM])
```

### Demo Credentials

| Role | Public Demo PIN | Scope |
|---|---|---|
| **Staff Nurse** | `2468` | Review live priority queue and call patients to triage desk |
| **Medical Officer (Doctor)** | `1357` | Inspect pre-consultation card, record notes, and close visits |
| **Hospital Admin** | `9090` | Seed synthetic OPD patients (**SIM**) and review analytics |

*Note: Public demo PINs are restricted to simulated records for privacy. Private staff accounts are provisioned via `apps/api/scripts/staff.mjs`.*

---

## Trilingual Localization

NikTan supports full trilingual localization with a native speaker focus for Chhattisgarh:
- **हिंदी (Hindi):** Primary language with synthesized speech guidance.
- **छत्तीसगढ़ी (Chhattisgarhi):** Authentic state vernacular (`apps/web/src/i18n/hne.json`) tailored for rural outpatients in Central India ("तबियत कइसन हे?", "पहिली जाँच तोर मोबाइल").
- **English:** Full clinical parity for medical staff and administrators.

---

## Run the Prototype Locally

### Prerequisites
- Node.js 20 or 22
- pnpm 9 or 10

### Setup & Launch
```sh
# 1. Clone and install dependencies
git clone https://github.com/ewwhardik/niktan.git
cd niktan
pnpm install

# 2. Run local database migrations
pnpm --filter @niktan/api db:migrate:local

# 3. Execute test suite and type checking
pnpm test
pnpm typecheck
pnpm build

# 4. Start local development servers
# Terminal 1: Backend API (Port 8787)
pnpm dev:api

# Terminal 2: Frontend PWA (Port 5173)
pnpm dev:web
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Open [http://localhost:5173/status](http://localhost:5173/status) to view live database connectivity and multi-provider health.

---

## Population-Scale Cost Analysis

Because all biometric processing occurs on the citizen's phone, server operating costs are minimal:

| Component | Usage for 100,000 Screenings | Monthly Cost (INR) | Monthly Cost (USD) |
|---|---|---|---|
| **Cloudflare Workers** (API) | ~1.5M requests | ₹425 | $5.00 |
| **Cloudflare D1** (SQLite) | ~1M writes / 15M reads | Included in $5 Workers tier | Included |
| **Groq Whisper Large-v3-Turbo** | ~50k voice sessions | ₹690 | $8.25 |
| **Google Gemini 2.5 Flash** | ~80k structuring calls | ₹550 | $6.60 |
| **Gemini Flash Vision** | ~30k thali scans | ₹325 | $3.90 |
| **Cloudflare Workers AI** | Overflow failovers | ₹200 | $2.40 |
| **TOTAL** | **100,000 Citizens** | **~₹2,190 – ₹2,900 / mo** | **~$26 – $35 / mo** |

**Cost per screening:** **₹0.038 (under 4 paise)**. Compare this to ₹50–200 for a single lab Hb test. Full economic details: [`docs/cost.md`](docs/cost.md).

---

## Technical Documentation Index

For comprehensive implementation blueprints, benchmarks, and clinical reviews:

| Document | Description |
|---|---|
| 📄 [`docs/validation.md`](docs/validation.md) | Clinical problem validation, OPD wait studies, ABDM Scan & Share analysis, field observations |
| 📊 [`docs/metrics.md`](docs/metrics.md) | Quantitative evaluation metrics, before/after comparisons, queue integration test benchmarks |
| 💰 [`docs/cost.md`](docs/cost.md) | Costed plan for population-scale deployment (100k screenings/month, hospital tablet options) |
| 👁️ [`docs/model-card-anemia.md`](docs/model-card-anemia.md) | Machine learning model card for conjunctival pallor detection (features, datasets, ROC-AUC) |
| 🎬 [`docs/demo-script.md`](docs/demo-script.md) | Step-by-step 3-minute stage pitch and presentation guide for hackathon judging |
| 🏗️ [`docs/architecture.md`](docs/architecture.md) | Detailed architectural topology, sequence diagrams, security threat models, and D1 schemas |
| 🍽️ [`ml/anemia/README.md`](ml/anemia/README.md) | Python training scripts, feature extraction pipelines, and golden cross-validation fixtures |

---

## Ethical Principles & Safety Boundaries

1. **Non-Diagnostic Screening:** NikTan is explicitly an assistive pre-consultation triage tool. It does not replace a registered medical practitioner. All findings are phrased as risk tiers and recommendations for diagnostic laboratory confirmation.
2. **Emergency Protocol (Fail-Safe):** Confirmed life-threatening symptoms automatically bypass OPD queues and present immediate 108 emergency contact directives.
3. **On-Device Biometric Isolation:** Facial video streams and eye images are processed entirely within in-memory WebAssembly buffers and are destroyed upon step completion. No raw biometric imagery is ever transmitted or stored.

---

## Team & Credits

- **Event:** Hackasol 5.0, IIIT Naya Raipur, Chhattisgarh.
- **Track:** Open Innovation (OI-01: Build for Real-World Impact).
- **Core Stack:** React 18, Vite, TypeScript, Tailwind CSS, MediaPipe Tasks Vision, WebAudio API, Hono, Cloudflare Workers, Cloudflare D1, Google Gemini API, Groq, and Workers AI.
