# NikTan (निकतन)

> **"तबियत कइसन हे? तीन मिनट म जाँच लव।"**  
> *"Your phone is the first checkup. The OPD knows you before you arrive."*

[![Hackathon](https://img.shields.io/badge/Hackasol%205.0-Track%201%3A%20Open%20Innovation%20(OI--01)-8b5cf6.svg)](https://iiitnr.ac.in)
[![Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare%20Workers%20%2B%20Pages%20%2B%20D1-orange.svg)](https://workers.cloudflare.com)
[![Privacy](https://img.shields.io/badge/Privacy-On--Device%20Edge%20CV%20(WASM)-success.svg)](docs/architecture.md)
[![Tests](https://img.shields.io/badge/Tests-131%20passing-brightgreen.svg)](packages/core/test)

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
- **Detailed Clinical Rationale:** See [`docs/validation.md`](docs/validation.md) for full citations and the planned validation (survey, OPD observation and recorded quotes still to be collected).

---

## Measurable Impact (Before / After)

| Metric | Traditional Baseline | With NikTan Prototype | Quantitative Impact | Verification Method |
|---|---|---|---|---|
| **Doctor History & Vitals Duration** | 2.5 – 4.0 min (out of 5.3 min total consult) | **0.5 – 1.0 min** | **65% – 75% time saved** per patient | Pre-consultation card stopwatch evaluation |
| **High-Risk Patient Priority Discovery** | 80 – 120 min (waiting at position 15 in FIFO queue) | **< 10 seconds** (instant priority jump or 🔴 Emergency bypass) | **Moved from 15th to 1st (0 ahead)** | Automated integration test (`apps/api/test/d1.test.mjs`) |
| **Cost of Basic Comprehensive Screening** | ₹650 – ₹1,500 (Hb blood draw, optometry, audiometry, travel) | **₹0 for citizen** / **~₹0.02 server cost (estimate)** | **Estimate** | Edge-compute economic model (`docs/cost.md`) |
| **Screening Throughput per Device** | 0 (no pre-screening in standard OPDs) | **3.0 minutes** for full 5-module scan | **100+ screenings/day** per tablet | Production PWA execution |

> **Reproduce the Priority Queue Benchmark:**  
> In `apps/api/test/d1.test.mjs`, 14 routine synthetic visits were waiting in General Medicine. A 15th patient arrived reporting 3 days of acute fever. Arrival order placed the patient at position 15. NikTan's deterministic triage classified the case as **🟠 See Today**, reprioritizing the patient to **0 ahead (1st in line)** while preserving ticket #15. Run: `pnpm --filter @niktan/api test`. Full evaluation metrics in [`docs/metrics.md`](docs/metrics.md).

---

## Architecture and Data Flow

NikTan is engineered with an **Edge-First, Zero-Knowledge Privacy Architecture**. Heavy computer vision and audio DSP run entirely inside the client's browser WebAssembly runtime. Raw camera streams and ocular frames never touch a server or third-party AI provider, in a design aligned with India's **Digital Personal Data Protection (DPDP) Act 2023** (not a legal certification). Voice recordings and meal photos are sent to AI providers when online; face video and eye photos never leave the phone.

```mermaid
flowchart TD
    subgraph Client ["Citizen Smartphone / PWA (Edge Client)"]
        UI["React 18 + Vite + Tailwind + PWA"]
        subgraph EdgeCV ["Client-Side WebAssembly & Audio DSP"]
            MP["@mediapipe/tasks-vision (FaceLandmarker)"]
            RPPG["POS rPPG Algorithm (Capillary Blood Pulse)"]
            EYE["Ocular Crop & 11 Color Descriptors"]
            PALLOR["Logistic Regression Pallor Model"]
            VIS["Calibrated Tumbling-E Optotypes (card short edge, 53.98 mm)"]
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
- **Signal Processing:** Temporal channel normalization, band-pass filtering (**0.7 – 3.0 Hz**, corresponding to 42–180 bpm), detrending, and Welch/FFT spectral density peak tracking over a 10-second rolling window during the scan and the full 30-second capture for the result.
- **Quality Gate:** Rejects motion artifacts, lighting dropouts, and low signal-to-noise ratio (SNR) with clear audio-visual instructions ("कृपया स्थिर रहें", "बढ़िया रोशनी में आइए").
- **Live Pulse Waveform:** Real-time pulse waveform synced with heartbeats.

### M2: Ophthalmic Multi-Condition Screening
- **Conjunctival Pallor (Anemia Screening Flag):** MediaPipe automatically crops the inferior palpebral conjunctiva as the patient gently pulls the lower eyelid down. Extracts 11 normalized colorimetric features across CIELAB ($L^*, a^*, b^*$), normalized red/green ratios, and erythema indices.
- **Machine Learning Model:** Regularized logistic regression model trained on 731 pooled clinical samples (Ghana pediatric ML IDA dataset + Indian/Italian adult Eyes-defy-anemia dataset, CC BY 4.0).
- **High-Sensitivity Calibration:** Cross-validated AUC **0.707**, sensitivity **85.1%**, specificity **38.7%**. Calibrated deliberately for high sensitivity to prevent missed cases in resource-constrained environments. Detailed model card: [`docs/model-card-anemia.md`](docs/model-card-anemia.md).
- **Experimental Flags:** Ocular sclera yellowness ($b^*$ chromaticity) for preliminary jaundice detection, and pupil-to-iris white reflectance ratio for cataract screening.

### M3: Clinically Calibrated Tumbling-E Visual Acuity
- **Physical Calibration:** User matches an on-screen slider to the short edge of any standard ID-1 card (Aadhaar / ATM card, 53.98 mm) to derive exact screen pixels-per-millimeter ($PPM$).
- **Dual Testing Modes:**
  1. *40 cm Near Mode:* Monocular testing at an instructed 40 cm distance (camera-based distance tracking is not yet used).
  2. *2 m Far Mode:* Assisted distance acuity with directional taps or swipes.
- **Standardized Snellen Output:** 0.1 logMAR staircase with 5 optotypes per tier; referral boundary calibrated to worse than 6/12 (or $\ge 2$ lines difference between eyes) per WHO guidelines.

### M4: Digits-in-Noise (DIN) Speech Audiometry
- **Methodology:** Experimental, diotic digits-in-noise screen for adults (the method behind WHO hearWHO), using Hindi digit triplets (e.g., "३ ७ २") in speech-shaped noise. The pass/refer cut-off comes from published non-Hindi DIN research and is provisional until calibrated on local normal-hearing listeners.
- **Adaptive Staircase:** 1-up-1-down SNR adaptation over 23 triplets. Evaluates speech recognition threshold (SRT) in decibels SNR.
- **Audio:** The Hindi digit and voice-guide recordings in `apps/web/public/audio` were synthesised with eSpeak NG (via the Echogarden toolkit); replace them with recorded human speech before any clinical use.

### M5: Multimodal Voice Symptom Structuring
- **Push-to-Talk Speech Capture:** Patients speak naturally in Hindi, Chhattisgarhi, or Hinglish ("3 दिन से बुखार है और खाँसी आ रही है").
- **Multi-Tiered ASR Failover:** Groq Whisper Large-v3-Turbo $\rightarrow$ Cloudflare Workers AI Whisper $\rightarrow$ In-browser Web Speech API (`hi-IN`).
- **Constrained Medical Structuring:** Structured by LLM (Gemini Flash / Groq) into a strict Zod-validated schema with a closed 40-item bilingual clinical vocabulary (`packages/core/src/data/symptoms.json`).
- **Emergency Safety Double-Confirmation:** Confirms life-threatening red flags (chest pain, acute dyspnea, pregnancy bleeding, seizures) before routing.

### M6: Deterministic Priority Triage Engine
- **Clinical Protocol:** Emergency Severity Index (ESI) and Manchester Triage inspired rule engine (`packages/core/src/triage.ts`).
- **Triage Tiers:**
  - 🔴 **EMERGENCY:** Critical vital signs (HR > 130 or < 40 bpm) or confirmed red flags $\rightarrow$ Bypasses the OPD queue and shows a direct `tel:108` button. It does not notify the hospital; a patient already in a queue who becomes an emergency is re-triaged to the top of the board.
  - 🟠 **SEE TODAY:** Moderate vital deviations, fever $\ge 3$ days, acute pallor with fatigue, or sudden sensory loss $\rightarrow$ Elevated to top priority in OPD queue.
  - 🟢 **ROUTINE:** Stable presentations $\rightarrow$ Sorted by arrival order.
- **Automated Department Routing:** Routes to 8 specialized departments (General Medicine, Pediatrics for age < 14, Obstetrics & Gynecology, Ophthalmology, ENT, Orthopedics, Dermatology, Surgery).

---

## NikTan Thali: Nutrition Engine

NikTan closes the clinical loop by linking screening observations (e.g., conjunctival pallor) with nutritional dietary interventions:
1. **Computer Vision Dish Recognition:** Meal photos are analyzed via Gemini Flash Vision against a catalogue of **70 Indian and Chhattisgarhi dishes** whose nutrient values come from the Indian Nutrient Databank (the INDB data files carry no explicit licence; ask the authors before redistribution).
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

### Operations & Accountability Endpoints

| Route | Access | Purpose |
|---|---|---|
| `GET /api/health` | Public | Liveness probe (version and build only, no database work) |
| `GET /api/hospital/:hid/board` | Staff | Live board; send `If-None-Match` with the last `ETag` to get a cheap `304` while nothing changed |
| `GET /api/hospital/:hid/impact` | Staff | Today's priority queue vs. first-come-first-served: minutes saved per priority, real-only and with simulated visits, plus doctor-rated usefulness of the pre-filled history |
| `GET /api/hospital/:hid/audit?limit=50` | Admin | DPDP audit trail (logins, token moves, note saves, simulator use), newest first, max 200 |

Every response carries `X-Request-Id` and `Server-Timing`; error bodies include `requestId` so it can be quoted in a bug report. JSON bodies are capped at 64 KB. Real screenings are kept for `RETENTION_DAYS` (default 30), simulated visits for 2 days, thali scans for 7 days and audit entries for 180 days.

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
| 📄 [`docs/validation.md`](docs/validation.md) | Clinical problem validation, OPD wait studies, ABDM Scan & Share analysis, planned validation |
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

## Data, Models and Third-Party Assets

Nothing below is redistributed beyond what its licence allows; raw datasets are not in this repository.

| What | Used for | Source | Licence |
|---|---|---|---|
| ML IDA Conjunctiva Dataset from Ghana | Training the pallor model (derived coefficients only) | Asare, Appiahene, Donkoh, Mendeley Data V1 (2022), doi:10.17632/nt7r8hv2pz.1 | CC BY 4.0 |
| Eyes-defy-anemia | Training and per-country evaluation of the pallor model | Dimauro et al., IEEE DataPort (2022), doi:10.21227/t5s2-4j73 | CC BY 4.0 |
| Indian Nutrient Databank (INDB) | Dish nutrient values | Vijayakumar et al., *Curr Dev Nutr* 8(7):103790 (2024); github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- | Paper CC BY; data files carry no explicit licence |
| ICMR-NIN Nutrient Requirements 2020 / IFCT 2017 | Daily targets, raw-ingredient values | ICMR-National Institute of Nutrition, Hyderabad | Public reference |
| MediaPipe FaceLandmarker | Face and iris landmarks in the browser | Google, `@mediapipe/tasks-vision` | Apache 2.0 |
| Hindi digit and guide audio | Hearing test and voice guidance | Synthesised with eSpeak NG via Echogarden | eSpeak NG is GPL-3.0 software; replace with recorded speech before clinical use |
| Inter, Noto Sans/Serif Devanagari, Instrument Serif | Typography | Fontsource packages | SIL Open Font License |
| OPD waiting-time figures | Problem statement | Published Indian OPD time-motion studies, e.g. IJCMPH (ijcmph.com/index.php/ijcmph/article/view/16572); AIIMS Delhi OPD volumes; ABDM Scan & Share press release (PIB, 2026) | Cited, not redistributed |

## Team & Credits

- **Event:** Hackasol 5.0, IIIT Naya Raipur, Chhattisgarh.
- **Track:** Open Innovation (OI-01: Build for Real-World Impact).
- **Core Stack:** React 18, Vite, TypeScript, Tailwind CSS, MediaPipe Tasks Vision, WebAudio API, Hono, Cloudflare Workers, Cloudflare D1, Google Gemini API, Groq, and Workers AI.
