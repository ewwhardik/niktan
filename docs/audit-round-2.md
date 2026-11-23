# Audit, round 2: flaws, evidence and next steps (24 Nov 2026)

## Flaws found and fixed

| # | Flaw | Effect | Fix |
|---|---|---|---|
| 1 | Team reviews were limited to 6 per network per hour | At the venue every team shares the Wi-Fi address, so the 7th team was refused | Limit raised to 60 per network per hour (`apps/api/src/routes/reviews.ts`) |
| 2 | "Add a check" on the Health Card for a planned step (e.g. heart rate after skipping it) ran the rest of the scan again | People were walked back through the eye check and symptoms | `?then=card` runs only that step and returns to the card (`ScanStep.tsx`, `HealthCard.tsx`) |
| 3 | The eye check could not move past the straight-ahead photo if the whites of the eyes could not be read (small in frame, half-closed, dim) | No eyelid photo either, so no anaemia check | After two misses it moves on to the eyelid photo and says why; the jaundice and cataract questions still count (`EyeScan.tsx`) |
| 4 | Every non-timeout provider failure was logged as "provider request failed" | The backup Workers AI account fails 4 of 4 calls in ~11 ms and the cause was invisible | Failures are logged as a safe class (`http 401`, `http 429`, `invalid output`, `missing credentials`), never bodies or keys (`ai/adapter.ts`, tested) |

## Found, not changed (needs your decision)

**Image reading is slow because the slowest provider goes first.** Production, last 24 h:

| Provider | Vision calls OK | Average time |
|---|---|---|
| Workers AI (primary) | 7 / 12 (5 timeouts) | 12.8 s |
| Workers AI (backup account) | 0 / 4 | 11 ms (configuration fault) |
| Gemini | 2 / 6 | 3.4 s |
| Groq | 3 / 3 | 1.9 s |

Thali, Medicine Saver and Lab report wait for Workers AI first (18 s timeout). The order is deliberate, so the free Cloudflare allocation is used first (a test covers it). Putting Groq first would cut the typical wait from ~13 s to ~2 s at the cost of Groq's free-tier limits. Separately, the backup account's token or account ID needs checking: the new log class will show the HTTP status on its next failure.

**Vercel preview deployments can't call the API.** CORS allows `niktan.vercel.app` and `*.niktan.pages.dev`, not `niktan-*-ewwhardiks-projects.vercel.app`, so previews show offline states.

## Does the evidence support the solution?

| Claim | Evidence | Verdict |
|---|---|---|
| The gap is real: registration is digital, priority is not | Scan & Share issued 23.21 crore ABHA-linked OPD tokens by June 2026, and it issues registration tokens only ([PIB](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/jul/doc202676912801.pdf), [MoHFW](https://mohfw.gov.in/press-info/7554)). A 2026 simulation study uses the token system as the baseline that "treats all patients equally regardless of clinical urgency" ([Gupta et al., arXiv](https://arxiv.org/abs/2604.00215)) | Supported |
| Priority queues reduce urgent waits in Indian OPDs | No field trial found; simulation and rule-based urgency studies only ([arXiv](https://arxiv.org/abs/2604.00215)) | Plausible, **unmeasured**: the pilot is the evidence the field lacks |
| Rule-based triage is safer than AI symptom checkers | In one ED study, 14% of a commercial checker's triage advice was judged unsafe ([JMIR mHealth 2023](https://mhealth.jmir.org/2023/1/e49995/PDF)). NikTan uses deterministic rules and confirms red flags | Design choice supported; NikTan's rules still need clinician review |
| Heart rate from the face | Studies report errors of ~3 bpm; some find no skin-tone penalty, others report bias at the darkest tones ([Cureus 2023](https://assets.cureus.com/uploads/original_article/pdf/150278/20230912-4180-vpq056.pdf), [Google PHRM](https://research.google/pubs/passive-heart-rate-monitoring-during-smartphone-use-in-everyday-life/), [skin-tone review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12592569/)) | Supported, with a quality gate (NikTan has one) |
| Anaemia from eyelid photos | 486 pregnant women in India: 89.6% sensitivity, **26.1% specificity**, judged not clinically useful ([Wemyss 2025](https://discovery.ucl.ac.uk/cgi/export/eprint/10204534/Simple/discovery-eprint-10204534.txt)). An Indian app reports ≥88% / 72–76% in a hospital study ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12367197)). NikTan's model: 84% / 43% | Weak signal. Keep it as "get an Hb test", never a result |
| Vision (tumbling E on a phone) | Peek Acuity agreed with ETDRS within 0.07 logMAR in 300 adults ([JAMA Ophthalmol 2015](https://jamanetwork.com/journals/jamaophthalmology/article-abstract/2296911)) | Supported |
| Hearing (digits in noise) | Antiphasic DIN: sensitivity 0.96, specificity 0.93; antiphasic beats diotic presentation (0.90/0.80 vs 0.75/0.71) ([Frontiers 2021](https://www.frontiersin.org/articles/10.3389/fpubh.2021.725080/full)). NikTan uses **diotic** | Method supported; NikTan's variant is the weaker one |
| Jaundice from the sclera | BiliScreen: r = 0.89 with serum bilirubin, 89.7% sensitivity / 96.8% specificity, **with a light-box accessory** ([UW](https://ubicomplab.cs.washington.edu/publications/biliscreen)) | Supported in principle; NikTan's paper reference is a lighter version, unvalidated |

## Proposed next additions (ranked by value for the brief)

1. **Desk vitals entry.** A nurse types BP, temperature, SpO₂ and a point-of-care Hb at the counter, and the visit is re-triaged. Most desks already have these devices, and Mitanins already carry digital BP monitors ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10717607/)). This closes the "take pulse at the desk" gaps with real numbers. *Effort: small.*
2. **Pilot mode for field validation.** Consent, a staff stopwatch for history-taking with and without the pre-consult card, a priority-by-wait export (CSV) and a short staff questionnaire. This turns the open "minutes saved" question into data. *Effort: small–medium.*
3. **Scan & Share bridge.** The citizen enters or scans their HMIS token number, so the NikTan card attaches to the hospital's existing token instead of a parallel one, with a FHIR bundle export for ABDM-ready HMIS. This is the adoption path. *Effort: medium; needs an HMIS partner.*
4. **Antiphasic hearing test.** Invert the digits in one ear (noise unchanged), as hearWHO does: better sensitivity and specificity with the same earphones. The cut-off needs recalibrating on normal-hearing Hindi listeners. *Effort: small code, needs calibration.*
5. **Breathing rate from the front camera.** Upper-torso motion, validated at 0.78 breaths/min MAE in 50 people ([Communications Medicine 2022](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9053269/)). Breathing rate is a core triage vital, and the schema already has the field. *Effort: medium.*
6. **"Your turn is near" alerts** by web push or SMS, so patients can wait outside the crowded hall. *Effort: small (push) to medium (SMS, paid).*
7. **Mitanin / ASHA mode.** One phone screens many people offline, with per-person reset, a referral slip and sync to NP-NCD/ABHA later. *Effort: medium.*
