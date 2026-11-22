# NikTan Architecture & Technical Blueprint

> **Track:** Hackasol 5.0 · Open Innovation (OI-01)  
> **System:** Distributed Edge-First Mobile Health & OPD Triage System

---

## 1. System Topology & Data Boundaries

```mermaid
flowchart TD
    subgraph Client ["Citizen Phone (Browser / PWA)"]
        UI["React 18 + Vite + Tailwind PWA"]
        subgraph OnDeviceCV ["On-Device Edge Computing (WASM/WebGL)"]
            MP["@mediapipe/tasks-vision (FaceLandmarker)"]
            RPPG["POS Algorithm rPPG (Forehead/Cheeks FFT)"]
            EYE["Conjunctiva Auto-Crop & 11 Color Features"]
            ANEMIA["Logistic Regression Pallor Estimator"]
            VIS["Tumbling-E Calibrated Acuity (2m / 40cm)"]
            AUD["DIN Hindi Triplets Speech Audiometry (WebAudio)"]
        end
        UI --> MP --> RPPG
        UI --> MP --> EYE --> ANEMIA
        UI --> VIS
        UI --> AUD
    end

    subgraph SecurityBoundary ["Privacy Sandbox (DPDP Act 2023 Compliant)"]
        Note["RAW VIDEO & EYE FRAMES NEVER LEAVE THE DEVICE\nOnly numerical feature vectors and verified flags upload"]
    end

    Client -->|HTTPS JSON Payload| Worker

    subgraph CloudflareBackend ["Cloudflare Serverless Infrastructure"]
        Worker["Cloudflare Worker (Hono REST API)"]
        D1[("Cloudflare D1 (Serverless SQLite)")]
        Cache[("D1 / KV Cache")]
        Rules["packages/core (Deterministic Triage & Nutrition Engine)"]
        
        Worker --> Rules
        Worker --> D1
        Worker --> Cache
    end

    subgraph AIAdapters ["Multi-Provider Resilient AI Failover"]
        Adapter["AI Adapter (Timeout: 8s + Exponential Backoff)"]
        Gemini["Google Gemini 2.5 Flash / Flash-Lite"]
        Groq["Groq (Whisper-Large-v3-Turbo + gpt-oss-120b)"]
        WAI["Cloudflare Workers AI (Whisper-Turbo + Gemma)"]
        ClientFallback["Client-Side Fallback (Web Speech + Manual Chips)"]

        Worker --> Adapter
        Adapter -->|Primary| Gemini
        Adapter -->|Failover 1| Groq
        Adapter -->|Failover 2| WAI
        Adapter -->|Network Outage| ClientFallback
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
    API->>AI: Groq Whisper-Turbo -> Gemini Structuring
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
