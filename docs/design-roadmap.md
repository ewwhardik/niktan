# NikTan interaction design roadmap

## What changed

The English-first landing page now explains the product with animated graphics. The card has anatomical navigation, eye tracking runs live, the hearing and voice screens visualize audio, and the queue supports re-triage. Pulse v2 tracks three skin regions, combines POS and CHROM spectra and rejects implausible jumps between windows. Its 72 versus 138 bpm example comes from a synthetic trace. An interface should communicate acquisition quality without presenting that example as patient accuracy.

The first design increment upgrades the shared sheet used for language, sharing, deletion and confirmations. It gives the dialog a native modal focus boundary, returns focus to its opener, introduces a visible close target and supports drag, Escape and reduced motion. The remaining items below are proposed implementation work.

## Reference decisions

- Judang Rizki Muhammad’s tablet clinic queue study treats the front desk as the primary operator. Use its task framing to test whether a nurse can identify the next patient and act with one hand. Carry the department and token through the board-to-card transition. [Clinic Queue Dashboard](https://dribbble.com/shots/26217689-Clinic-Queue-Dashboard)
- Jacek Szpaczek’s medical queue concept groups the current and next patients with their presenting problems. Adapt this into two clearly labelled staff regions. Give the active consultation stable screen space as polling adds arrivals. [Medical Queue Management Dashboard](https://dribbble.com/shots/19182260--Medical-Queue-Management-Dashboard-Concept-Design)
- Awwwards highlights Humana’s Site of the Day for its deliberate decisions about visual identity and rendering cost. Apply that discipline to NikTan’s anatomy scene. Use the existing brand colours, one focal object and a lightweight illustration for low-power devices. Keep emergency instructions available on first paint. [Awwwards design casebook](https://assets.awwwards.com/awards/gallery/2023/07/HOT-RIGHT-NOW-BOOK-2023.pdf)

## Screen-by-screen build sequence

| Order and surface | Interaction to build | How to accept it |
|---|---|---|
| 1 · Landing | Put language, start and resume in the first viewport. Use one representative scan-to-card transition as the hero. Lazy-load lower storytelling sections and 3D. | At 360 px, a first-time visitor can explain what happens to their camera frames and start or resume without waiting for animation. |
| 1 · Consent and profile | Pair each capture type with its destination. Place optional recording and meal upload beside their manual alternatives. Keep age, sex and conditional pregnancy input in one focus sequence. | A keyboard or screen-reader user can change a prior answer and proceed. Hindi strings wrap at 200% zoom. |
| 2 · Face and eyes | Give framing, quality and elapsed time separate visual channels. On face loss, replace the oval instruction with one corrective action. Mark sampled cheek and forehead regions only while tracking. On eye capture show the actual reviewed crop before acceptance. | Inject low light, multiple faces, camera denial and interruption. Each state has an accurate label and a reachable retry or skip. No idle animation resembles a measured pulse. |
| 2 · Vision | Make calibration an explicit first task. Pin the selected distance and current eye during trials. Keep arrows in stable thumb positions and the optotype isolated from motion. | At 40 cm and 2 m, changing the page layout never changes calibrated stimulus size. Verify both eyes, direction keys and the display-resolution floor. |
| 2 · Hearing and symptoms | Use a short stereo rehearsal, then lock the keypad in place. Keep voice recording, transcription, review and confirmation visually distinct. Stop guide audio during capture. | Test early release during a permission prompt, missing audio, interrupted playback and recognition failure. A user can finish through manual input. |
| 3 · Health card | Lead with the action and department. Make anatomy hotspots and text rows select the same observation. Show quality, skipped status and what to do next inline. | With 3D disabled, every observation is still reachable. Emergency action appears immediately. Shared mode exposes only reading actions. |
| 3 · Queue and staff board | Keep the token stationary as position changes. Animate a short highlight only on a real state change. Group staff work by active consult, called and waiting. Preserve focus through polling and display the last successful refresh. | Simulate simultaneous arrival and call, stale network and re-triage. Verify staff can identify the next token and detect stale data without relying on colour. |
| 3 · Staff login and consult | Separate demo and private entry before PIN input. Preserve note drafts on a failed save. Show a pending close state with the patient token visible until confirmed. | Test wrong PIN, expired access, double submission and interrupted completion. A failed close leaves the note editable. |
| 4 · Thali | Tie the selected dish chip to its portion control. Update nutrient totals when the count changes, and announce the new serving count once. | Complete photo and manual journeys. Removing the final dish clears previous totals. Grams and household units remain visible on a narrow phone. |
| 4 · Feedback, status and admin | Differentiate empty, loading, stale and unavailable. Pair rates with sample counts. Separate simulation from real usage. Preserve feedback text while retrying. | Test a new hospital with zero visits and a failed API response. Neither produces a misleading success indicator. |

## Motion and verification

Use a short opacity change for network status, a press response for local input and a single positional transition for an actual change of place. Keep camera previews, optotypes and keypad geometry stationary during measurement. Use static labels for reduced motion. Suspend offscreen WebGL and idle loops when the page is hidden. For each screen, record the normal path, a failed action and a recovered action before tuning decorative transitions.

Capture baseline and revised builds at 360, 390, 768 and 1280 CSS pixels, in English and Hindi, light and dark. Include keyboard-only navigation, increased text size, reduced motion and an offline revisit. Compare start-to-card completion, recovery from denied camera permission, staff time to find and call the next patient, and dropped frames during capture. Record device, browser, sample count and baseline alongside results. Proposed performance targets are a responsive first action within 2.5 seconds on the agreed test profile and zero animation-dependent delays for emergency actions. Measure before claiming improvement.

## Detection architecture to evaluate

**First experiment.** Keep production inference on the phone. Build a separate offline evaluator around the existing benchmark harness. Input versioned, consented or synthetic region traces with timestamps and paired reference pulse. Run v1 and v2 on identical windows. Report median and upper-percentile absolute error, accepted-window coverage, false acceptance on motion and runtime. Split results by recording and lighting. Evaluate rejection rates alongside accuracy so rejecting most inputs cannot look like an improvement.

**Research reuse.** The University of Washington rPPG-Toolbox offers traditional and neural baselines and a useful experiment configuration structure. Its top-level licence contains use restrictions. Study its evaluation approach and review the applicable licence, model weights and dataset terms individually before incorporating code into a health product. Treat any future inference service as a separate consent and deployment decision. [Repository](https://github.com/ubicomplab/rPPG-Toolbox) · [Licence](https://github.com/ubicomplab/rPPG-Toolbox/blob/main/LICENSE)

**Hospital system reuse.** OpenMRS patient-management modules provide a reference for service queues, patient lists and scheduling. Map their workflow states against NikTan’s token transitions and prototype an adapter using synthetic visits if a hospital uses OpenMRS. Keep the Cloudflare API as the working demo path. [OpenMRS patient management](https://github.com/openmrs/openmrs-esm-patient-management)

Ship each numbered group as an independently reviewable change with before-and-after captures and the corresponding acceptance evidence. Start the next group after the preceding flow works at phone width with motion disabled.
