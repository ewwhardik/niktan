# NikTan (निकतन)

NikTan is a Hindi-first pre-consultation prototype for Hackasol 5.0, Open Innovation OI-01. A patient can record symptoms, try optional phone-based checks, review a health card and join an outpatient department (OPD) queue. Staff can call a token, read the pre-consultation card, record notes and close the visit. Confirmed emergency flags immediately surface a call to 108.

## Problem validation and impact

**Who faces the problem.** Patients can spend much of an OPD visit waiting to be called. A North India government teaching hospital study of 255 outpatients reported an average of 242.8 minutes from arrival until the doctor called the patient and 12.8 minutes in consultation. The arrival-to-consultation stages relied on patient-reported times in a convenience sample. These observations establish the problem at that site. A local Raipur baseline remains to be collected. [Original study](https://www.ijcmph.com/index.php/ijcmph/article/view/16572)

**Where NikTan fits.** India’s ABDM Scan and Share already helps patients register and obtain digital tokens. The National Health Authority describes substantial registration time savings. NikTan addresses a later handoff. The patient prepares a structured symptom history and screening card that the triage desk and doctor can read before the consultation. The prototype has its own demo hospitals and queue. [Government service description](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2281466)

**What the prototype improved in a controlled comparison.** In a local D1 test, 14 routine general medicine visits were waiting and no consultation had begun. A fifteenth patient reported three days of fever and joined through the API. Arrival-order sorting put 14 visits ahead. The priority queue returned **0 ahead**, moving the patient from **15th to 1st** while retaining ticket number 15. This measures queue order on synthetic records. Actual time saved, changes in outcomes and the effect on other patients require a field study. Reproduce with `pnpm --filter @niktan/api test`. [Integration test](apps/api/test/d1.test.mjs)

**Field validation still needed.** With permission from an OPD, time history-taking and vitals collection with and without a prepared card. Record the sample sizes, median and spread in both groups. Collect patient feedback and ask staff whether the history was useful. The app supports these questions. No team survey, interview quotations, real waiting-time reduction or clinical validation are claimed here.

## Run the prototype

Use Node 22 or 24 and pnpm 12. Run commands from the repository root. The API needs a migrated local D1 database. Core screening and manual entry work without external AI keys.

```sh
pnpm install --frozen-lockfile
pnpm --filter @niktan/api db:migrate:local
pnpm test
pnpm typecheck
pnpm build
```

For a new checkout, copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and set `STAFF_SECRET` to the output of `openssl rand -hex 32`. Keep this file private. Run `pnpm dev:api` and `pnpm dev:web` in separate terminals. Open [the local app](http://localhost:5173). Vite proxies API requests to port 8787. Open [service status](http://localhost:5173/status) for database connectivity, configured providers and recent provider-call counts. A camera or microphone needs localhost or HTTPS.

### Demo walkthrough and staff PINs

1. Choose a language, accept the data notice and enter a synthetic profile. Try a scan or skip to symptoms. Enter “fever for 3 days”, review the interpretation, and open the card. Join a seeded hospital queue.
2. To see this visit as staff, create a private doctor account for the **same hospital**. Run `pnpm --filter @niktan/api exec node scripts/staff.mjs demo-dh doctor --local`. In a separate browser session open `/hospital`, choose District Hospital and **Private staff access**, and enter the eight-digit PIN printed by the provisioner. Call the patient, start the consult, record notes and end the visit.
3. To show a board of synthetic patients, use either seeded hospital with demo mode enabled. Use the admin’s **Demo scenario** on the board to add simulated visits. They are labelled **SIM**.

| Public demo role | PIN | Use |
|---|---|---|
| Nurse | `2468` | Call simulated patients |
| Doctor | `1357` | Review and close simulated consultations |
| Admin | `9090` | Seed simulated visits and inspect demo statistics |

Public PINs are limited to simulated records. Private accounts are scoped by hospital. Use `demo-dh` or `demo-chc` when provisioning; roles are `nurse`, `doctor` and `admin`.

## Architecture and data flow

| Component | Responsibility |
|---|---|
| [React PWA](apps/web/src) | Camera frames, eye crops, pulse processing, calibrated vision, hearing playback, manual meal calculation and offline scan state |
| [Shared TypeScript core](packages/core/src) | Input schemas, deterministic priority and department rules, bilingual vocabulary and portion-based nutrition |
| [Hono Worker and D1](apps/api/src) | Measurement sync, read-only sharing, queue positions, staff access, feedback and daily retention cleanup |
| [Model training](ml/anemia) | Python feature extraction, evaluation and golden fixtures for the browser implementation |

The QR link contains a separate read-only handle. Anyone who receives it can read that card. Deleting the session invalidates the link. Face video and eye images stay on the device. Optional symptom audio, text for parsing and meal photos can reach configured providers. Users can type, tap or add dishes manually. NikTan does not store raw audio or photos in D1. The daily cleanup removes session records older than 30 days. A saved local scan can be deleted from its card. Keep personal identifiers out of free text and audio.

## Screening methods, data and model credits

| Feature | What ships and evidence |
|---|---|
| Face pulse | MediaPipe Tasks Vision **1.2.3**, matching WASM assets and Google’s versioned Face Landmarker. The POS implementation samples the forehead and both cheeks and checks signal consistency across rolling windows. Motion, gaps and poor signal can produce no reading. Breathing rate is withheld pending paired validation. [MediaPipe, Apache-2.0](https://github.com/google-ai-edge/mediapipe) · [Wang et al., POS](https://doi.org/10.1109/TBME.2016.2609282) |
| Vision | Calibrated tumbling E with separate 2 m distance and 40 cm near modes. The distance referral boundary is **worse than 6/12**, or at least two lines of difference between eyes. The app’s near result is labelled with its test distance. Phone-screen calibration, viewing distance and repeatability require human verification. [WHO screening handbook](https://iris.who.int/handle/10665/375590) · [Peek Acuity study](https://jamanetwork.com/journals/jamaophthalmology/article-abstract/2296911) |
| Hearing | Adults hear synthetic Hindi digit triplets against noise through earphones. The experimental comparison is **pass at or below −9.55 dB SNR**, refer above it. The cutoff comes from South African English research. Hindi recordings, masker and staircase need calibration with Hindi-speaking listeners against reference audiometry before clinical use. [English DIN study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5968873/) · [Hindi DIN study](https://doi.org/10.1007/s12070-024-04606-x) |
| Speech assets | The Hindi digits and fixed scan guidance are generated audio from the Hindi voice in eSpeak NG via the Echogarden Emscripten port, version 0.3.5 (GPL-3.0 software). Chhattisgarhi uses the Hindi guidance clips. [Synthesizer](https://github.com/espeak-ng/espeak-ng) · [Port](https://github.com/echogarden-project/espeak-ng-emscripten) |
| Conjunctival pallor | Logistic regression on 11 colour features. Training includes 514 deduplicated Ghana images from Appiahene, Asare and Donkoh and 217 Indian and Italian adult examples from Dimauro, Maglietta, Bai and Kasiviswanathan. Both datasets specify **CC BY 4.0**. The app ships derived coefficients. [Ghana data](https://doi.org/10.17632/nt7r8hv2pz.1) · [Eyes-defy-anemia](https://doi.org/10.21227/t5s2-4j73) · [Licence](https://creativecommons.org/licenses/by/4.0/) |

The pallor model’s pooled grouped cross-validation on 731 examples gave AUC **0.707**, sensitivity **85.1%** and specificity **38.7%**. It missed 57 of 382 positive examples and flagged 214 of 349 negative examples. The Indian subset had only 95 examples, with 83.8% sensitivity and 29.6% specificity. A phone capture under new lighting can perform differently. Pallor warrants confirmation with a haemoglobin test. The jaundice and white-pupil image flags are exploratory. [Model card](ml/anemia/README.md) · [Evaluation results](ml/anemia/metrics.json)

### Thali food data and release permission

The catalogue contains 70 dishes with household portions. Recipe substitutions, cooked weights and oil uptake are estimates. The meal comparison uses roughly one third of the reference daily target. Total meal fat is displayed in grams because the target table describes visible cooking fat.

- **Indian Nutrient Databank (INDB)** by Vijayakumar, Dubasi, Awasthi and Jaacks supplies recipe data. Its publication is open access. The upstream repository lists **no explicit licence for the data files**. **Ask the authors for written permission covering the derived per-serving catalogue before any public release.** The web and Worker bundles both include catalogue data. [Authors’ repository](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-) · [Publication](https://doi.org/10.1016/j.cdnut.2024.103790)
- **Indian Food Composition Tables 2017** by Longvah, Ananthan, Bhaskarachary and Venkaiah supplies ingredient values. Data copyright belongs to ICMR–NIN. Subhajit Sahu’s `@ifct2017/compositions` code is MIT-licensed. The package licence does not grant rights to the underlying tables. INDB also incorporates UK CoFID (Open Government Licence) and USDA data (public domain). [IFCT package and attribution](https://github.com/ifct2017/compositions) · [INDB source notes](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-)
- **ICMR–NIN Nutrient Requirements for Indians 2020** supplies age and sex reference values. Some subgroup figures in the local preparation notes came from a secondary copy of the short report and await verification against NIN’s edition. The report is copyrighted by ICMR–NIN. [NIN brief note](https://www.nin.res.in/rdabook/brief_note.pdf)

## Cloudflare deployment

The repository ships a placeholder database ID. Use the intended Cloudflare account and check INDB permission before publishing either bundle. The following commands use the workspace’s pinned Wrangler from the repository root.

1. Authenticate and create D1. If the intended database already exists, reuse it. Place its UUID in the `DB` binding in `apps/api/wrangler.toml`.

   ```sh
   pnpm --filter @niktan/api exec wrangler login
   pnpm --filter @niktan/api exec wrangler whoami
   pnpm --filter @niktan/api exec wrangler d1 create niktan
   ```

2. Create the Pages project for direct upload. Set the actual HTTPS Pages origin in the Worker's `ALLOWED_ORIGINS`. Set `DEMO_MODE=false` for a private-staff-only board. To use the account's Workers AI service, enable the commented `[ai]` binding. Migrate the **remote** database and deploy the Worker.

   ```sh
   pnpm --filter @niktan/api exec wrangler pages project create niktan --production-branch main
   pnpm --filter @niktan/api db:migrate:remote
   pnpm --filter @niktan/api deploy
   ```

3. Configure secrets using Wrangler's interactive input. Generate a fresh random signing secret with `openssl rand -hex 32`. Gemini and Groq keys come from the respective provider accounts and enable their optional AI paths. Keep all secrets out of Git and Vite environment variables.

   ```sh
   pnpm --filter @niktan/api exec wrangler secret put STAFF_SECRET
   pnpm --filter @niktan/api exec wrangler secret put GEMINI_API_KEY
   pnpm --filter @niktan/api exec wrangler secret put GROQ_API_KEY
   pnpm --filter @niktan/api exec node scripts/staff.mjs demo-dh doctor --remote
   ```

4. Set `VITE_API_URL` to the **actual HTTPS Worker origin** printed by Wrangler, then build and publish the PWA. The upload path below is relative to `apps/api`, where the filtered command runs.

   ```sh
   VITE_API_URL=https://niktan-api.YOUR-SUBDOMAIN.workers.dev pnpm --filter @niktan/web build
   pnpm --filter @niktan/api exec wrangler pages deploy ../web/dist --project-name niktan --branch main
   ```

5. On the Pages URL, open `/status` and check database connectivity. Run a synthetic screening, share and delete its card, then complete a second synthetic visit from a private staff login. Provider configuration on the status page shows which bindings are present. Exercise transcription and meal recognition to verify live provider access. [Cloudflare D1 setup](https://developers.cloudflare.com/d1/get-started/) · [Pages direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

**Operating cost.** With 1,000 screenings/day and an assumed 15 API requests per screening, the citizen flow uses about 15,000 Worker requests/day before staff polling and retries. One board polling every five seconds for eight hours adds about 5,760 requests. Cloudflare’s published Free limits are 100,000 Worker requests/day, five million D1 rows read/day and 100,000 D1 rows written/day. The estimated infrastructure charge is zero while all quotas are respected. Measure D1 row counts, polling load and each provider’s usage in a pilot before extrapolating. [Worker limits](https://developers.cloudflare.com/workers/platform/limits/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

## Verification scope

Automated tests exercise triage boundaries, meal calculations, pallor golden vectors, noisy pulse signals, sensory scoring and D1 access controls. Phone-size Chromium runs exercised camera denial, MediaPipe inference on synthetic video, Hindi hearing practice, microphone recording and release with synthetic audio, sharing, deletion, queue changes and feedback retries. In a separate browser session, a private doctor called the test patient, saved a note and closed the visit. The patient screen then showed completion. A production-browser offline check played all five Hindi guidance clips. These runs establish software behavior. Pulse agreement against an oximeter, Hindi hearing calibration, bedside accuracy and field impact still require human measurements.
