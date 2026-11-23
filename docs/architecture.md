# NikTan Architecture & Technical Blueprint

> **Track:** Hackasol 5.0 · Open Innovation (OI-01)  
> **System:** Distributed Edge-First Mobile Health & OPD Triage System

---

## 1. System Topology & Data Boundaries

The production PWA is served by Vercel. The browser calls the Cloudflare Worker API configured through `VITE_API_URL`. Cloudflare D1 stores screening sessions, queue tokens, and staff records. [Production app](https://niktan.vercel.app/) · [Screen-by-screen walkthrough](product-tour.md)

```mermaid
flowchart TD
    Vercel["Vercel · Static PWA"] --> UI
    subgraph Client ["Citizen Phone (Browser / PWA)"]
        UI["React 18 + Vite + Tailwind PWA"]
        subgraph OnDeviceCV ["On-Device Edge Computing (WASM/WebGL)"]
            MP["@mediapipe/tasks-vision (FaceLandmarker)"]
            RPPG["POS Algorithm rPPG (Forehead/Cheeks FFT)"]
            EYE["Conjunctiva Auto-Crop & 11 Color Features"]
            ANEMIA["Logistic Regression Pallor Estimator"]
            VIS["Tumbling-E Calibrated Acuity (2m / 40cm)"]
            AUD["Hindi digits-in-noise and per-ear tone screening (Web Audio)"]
        end
        UI --> MP --> RPPG
        UI --> MP --> EYE --> ANEMIA
        UI --> VIS
        UI --> AUD
    end

    subgraph SecurityBoundary ["Privacy Sandbox (DPDP Act 2023-aligned design (not a legal certification))"]
        Note["RAW VIDEO & EYE FRAMES NEVER LEAVE THE DEVICE\nNumerical feature vectors, verified flags, voice recordings and meal photos upload"]
    end

    Client -->|HTTPS JSON Payload| Worker

    subgraph CloudflareBackend ["Cloudflare Serverless Infrastructure"]
        Worker["Cloudflare Worker (Hono REST API)"]
        D1[("Cloudflare D1 (Serverless SQLite)")]
        Rules["packages/core (Deterministic Triage & Nutrition Engine)"]
        
        Worker --> Rules
        Worker --> D1
    end

    subgraph AIAdapters ["AI adapter: ordered fallback chain per task (output schema-checked, 8 s default timeout)"]
        Adapter["runChain: try next provider on error, timeout or invalid output"]
        ASR["Speech: Workers AI Whisper large-v3-turbo → backup account → Groq Whisper → browser Web Speech"]
        LLM["Text: Gemini Flash-Lite → Groq gpt-oss-120b → Workers AI Llama 3.3 70B → backup gpt-oss-120b → offline keyword parser"]
        VIS["Photos: Workers AI Llama 4 Scout → backup account → Gemini Flash-Lite → Groq Qwen vision → manual entry"]
        CHAT["Assistant: Groq gpt-oss-120b → Gemini → Workers AI → backup"]

        Worker --> Adapter
        Adapter --> ASR
        Adapter --> LLM
        Adapter --> VIS
        Adapter --> CHAT
    end

    subgraph StaffPortal ["Hospital OPD System (/hospital)"]
        Board["Live Triage Board (Real-Time Priority Polling)"]
        DoctorCard["Pre-Consultation Clinical Card"]
        AdminDashboard["Epidemiological Dashboard & Load Analytics"]
        Simulator["Synthetic Patient Queue Generator (SIM)"]
        
        Board --> Worker
        DoctorCard --> Worker
        AdminDashboard --> Worker
        Simulator --> Worker
    end
```

---

**Data flow note:** voice recordings and meal photos ARE sent to AI providers (Workers AI / Gemini / Groq) when online; face video and eye photos never leave the phone.

**How a provider is chosen** (`apps/api/src/ai/adapter.ts`, `providers.ts`): each task has an ordered list. Providers without credentials are skipped; each call has a timeout (8 s by default, 18–28 s for photos); the answer must pass the task's Zod schema. An error, timeout or invalid answer moves on to the next provider, and when all fail the app uses a non-AI path (keyword parser, symptom chips, manual entry). Speech and photos start with Cloudflare Workers AI so its free allocation is used first. Prescriptions are read by two model families in parallel and merged line by line; lab flags are computed in code, not by the model. Readings are cached for an hour by a hash of the input. The backup Workers AI account only helps when `CLOUDFLARE_AI_BACKUP_ACCOUNT_ID` and `CLOUDFLARE_AI_BACKUP_TOKEN` are valid; check them on `/status`.

---

## 2. Core Processing Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Citizen as Citizen / Patient
    participant PWA as In-Browser PWA (WASM)
    participant API as Cloudflare Worker (Hono)
    participant Core as Deterministic Triage Engine
    participant AI as Resilient AI Adapter
    participant D1 as D1 Database
    actor Doctor as OPD Medical Officer

    Citizen->>PWA: Start Scan (Language: hi/hne/en)
    PWA->>PWA: Face Vitals (rPPG POS algorithm -> BPM + SNR)
    PWA->>PWA: Eye Scan (Conjunctival crop -> 11 color features -> Pallor risk)
    PWA->>PWA: Vision (Tumbling-E) & Hearing (Hindi DIN test)
    Citizen->>PWA: Push-to-Talk Speech ("सीने में दर्द और बुखार")
    PWA->>API: POST /api/asr (Audio Blob)
    API->>AI: Whisper large-v3-turbo (Workers AI, then Groq) -> LLM structuring (Gemini, then Groq, then Workers AI)
    AI-->>API: Symptom JSON {chest_pain: true, fever: true}
    API-->>PWA: Present Understood Symptoms + Red-Flag Confirmation
    Citizen->>PWA: Confirm Symptoms
    PWA->>API: POST /api/sessions/:id/triage
    API->>Core: Evaluate Deterministic Triage Rules
    Core-->>API: Tier: 🔴 EMERGENCY or 🟠 SEE TODAY
    API->>D1: Insert / Update Session & Priority Token
    API-->>PWA: Render Health Card + 108 Emergency Banner
    API-->>Doctor: Hospital Triage Board reorders instantly
    Doctor->>API: Click Patient Token
    API->>D1: Fetch Pre-Consult Record
    API-->>Doctor: Display Pre-Consult Card (Vitals + Symptoms + Flags)
    Doctor->>API: Record Clinical Notes & Close Visit (Logs Consult Duration)
```

---

## 3. Storage Schema & Lifecycle

1. **`sessions`:** Ephemeral screening sessions with randomized anonymous UUIDs. Age, sex, pregnancy status, language, and hospital selection. No personal identifiers (names, phone numbers, or government IDs) are ever accepted or stored.
2. **`measurements`:** Discrete numerical module results with quality scores and model version identifiers.
3. **`triage`:** Priority tier (`emergency`, `see_today`, `routine`), target clinical department (`medicine`, `pediatrics`, `gynecology`, `ophthalmology`, `ent`, `orthopedics`, `dermatology`, `surgery`), and bilingual justification strings.
4. **`tokens`:** Sequence numbers, priority weights, state transitions (`waiting`, `called`, `in_consult`, `done`), and timestamps for waiting-time analytics.
5. **Data Retention Policy:** Automated cron job purges session and visit records older than 30 days. Patients can execute complete on-demand local and server deletion by tapping "मेरा डेटा मिटाएँ" (Delete My Data) on their health card.
