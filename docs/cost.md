# Costed Plan for Operating at Scale

> **Track:** Hackasol 5.0 · Open Innovation (OI-01)  
> **Project:** NikTan (निकतन)  
> **Deliverable:** Bonus criterion — costed architecture and economic model for population-scale deployment.

---

## 1. Executive Summary

NikTan's edge-first architecture eliminates server-side video, image, and signal processing. High-throughput biometric computing (MediaPipe 468-point face mesh, rPPG POS signal filtering, conjunctiva image cropping, tumbling-E acuity rendering, and WebAudio DIN noise generation) runs entirely **inside the citizen's browser WebAssembly runtime**.

Consequently, server-side compute is limited to lightweight JSON serialization, deterministic rule evaluations, and intermittent natural-language structuring.

- **Per-Screening Server Cost (estimate):** **~₹0.022 (about 2 paise)**, calculated from the monthly total below.
- **Monthly Cost for 100,000 Screenings (estimate):** **₹2,190 ($26.15 USD)**.
- **Cost Comparison (estimate):** Server cost of about ₹0.02 per screening, against roughly ₹50 to ₹200 for a single venous haemoglobin test. This covers server cost only; the citizen's phone and data are not included.

---

## 2. Infrastructure Cost Breakdown (1 Lakh / 100,000 Screenings per Month)

Assuming a district-wide deployment across **1 District Hospital + 4 Community Health Centres (CHCs)** generating **~3,300 screenings per day**:

| Layer / Service | Usage for 100k Screenings | Unit Pricing (Official Paid Rates) | Total Monthly Cost (INR) | Total Monthly Cost (USD) |
|---|---|---|---|---|
| **Cloudflare Workers** (API) | ~1,500,000 requests (15 req/session) | $5/month base (includes 10M requests) | ₹425 | $5.00 |
| **Cloudflare D1** (Database) | ~1,000,000 writes / 15M reads | Included in $5 Workers Paid tier | Included | Included |
| **Cloudflare Pages** (PWA Hosting) | Static asset CDN egress | Free unlimited egress | ₹0 | $0.00 |
| **Whisper Large-v3-Turbo** (Voice ASR, priced at Groq's paid rate) | ~50,000 voice sessions (avg 15s audio = 750,000s) | $0.04 / hour of audio ($0.000011/sec) | ₹690 | $8.25 |
| **Gemini Flash-Lite class** (Symptom Structuring, paid rate) | ~80,000 calls (avg 500 prompt tokens + 150 output tokens) | $0.075 / 1M input, $0.30 / 1M output | ₹550 | $6.60 |
| **Photo reading** (Thali Recognition, priced at Gemini's paid rate) | ~30,000 meal photos | $0.00013 per image call | ₹325 | $3.90 |
| **Cloudflare Workers AI** (beyond the free daily allocation) | Overflow neuron consumption | $0.011 / 1k neurons | ₹200 | $2.40 |
| **Logging & Monitoring** | Sentry / Cloudflare Analytics free tiers | Free tier | ₹0 | $0.00 |
| **TOTAL MONTHLY OPERATING COST** | **100,000 Citizens Screened** | — | **₹2,190** | **$26.15** |

> The AI lines are an upper estimate at paid rates. In the code, speech and photo reading try Cloudflare Workers AI first (Whisper large-v3-turbo, Llama 4 Scout), so its free allocation is used before Gemini or Groq; text structuring tries Gemini Flash-Lite first.
>
> AI prices (Groq, Google Gemini, Cloudflare Workers AI) must be re-checked on the providers' pricing pages before this plan is used, because they change over time.

---

## 3. Hardware Deployment Options in Government OPDs

NikTan does not require specialized medical kiosks:

1. **Option A: Bring Your Own Device (BYOD) — 80% of OPD Footfall**
   - Patients scan a QR code at the OPD entrance (alongside ABDM Scan & Share).
   - Runs directly on Android Chrome, Samsung Internet, or mobile Safari (designed for ₹8,000 low-end Android devices).
   - **Hardware cost to hospital:** **₹0**.

2. **Option B: Assisted Triage Tablet (For digitally illiterate / non-smartphone citizens) — 20% of Footfall**
   - 2 rugged 10-inch Android tablets at the OPD registration desk operated by a hospital Sahayak / ASHA worker.
   - Tablet cost: 2 × ₹9,500 = **₹19,000 one-time capital expenditure**.
   - Throughput: 120 assisted screenings per 4-hour morning shift.

---

## 4. Return on Investment (ROI) for Public Health Systems

For a typical district hospital seeing 2,000 OPD patients daily (~60,000/month):
1. **Doctor Time Recovered:**
   - Saving 2 minutes of repetitive history/vitals collection across 1,000 consultations daily = **33.3 doctor-hours saved every single day**.
   - Equivalent to adding **4 full-time medical officers** to the outpatient roster with zero added staffing expenditure.
2. **Early Detection Value:**
   - Identifying silent severe anemia in pregnant mothers and routing them to immediate iron sucrose infusions prevents obstetric hemorrhages and high-risk deliveries.
   - Detecting cataract and severe refractive errors before irreversible sensory deprivation preserves productive agricultural labor in rural communities.
