# Audit against OI-01 (Hackasol 5.0)

This audit checks NikTan against the four must-haves and two bonus items in the OI-01 brief, lists what held up, what did not, and what was changed. It covers two review passes: the second pass re-checked the fixes from the first and found one more bug.

## Scorecard

| OI-01 requirement | Before this audit | After |
|---|---|---|
| **Problem validation** (who, why current tools fall short, evidence) | Strong desk research (OPD time-motion studies, ABDM Scan & Share gap). No user evidence: `docs/validation.md` had empty quote placeholders. The in-app survey already asked for the last OPD wait, but only the admin dashboard showed the answers. | The landing page shows the survey's anonymous aggregates live (average self-reported OPD wait, share who would use it, rating, n). Every person who tries the app at the event adds evidence the judges can see. Quotes stay unfilled until real ones are recorded. |
| **Working prototype** (one complete end-to-end workflow) | Citizen scan → Health Card → queue token works. The hospital side works for the admin PIN only: the nurse and doctor demo PINs opened an empty board with no way to add patients. A citizen's real scan never appears on the public board (privacy rule), so phone → board could not be shown live. | Any public demo PIN can add simulated patients, and the empty board explains why it is empty. A citizen joining a demo hospital can tick **Show my visit on the demo board** (age, sex and results only). The judge's own phone scan then appears on the board with a **LIVE** badge, sorted by priority. |
| **Measurable impact** (before/after metric) | `GET /api/hospital/:hid/impact` computed priority-queue vs first-come waits, but no screen used it. The counterfactual assumed the doctor worked non-stop from the first arrival. When the doctor started late, the first-come line looked free. In the demo scenario this showed urgent patients being called **later**. | The board has an impact strip ("Urgent patients called N min sooner", per-priority actual vs first-come). The admin dashboard has per-priority bars. The counterfactual now gives the doctor's real call times to patients in arrival order, and puts emergency bypasses back into the General Medicine line they would have joined. Routine patients waiting a little longer is shown, not hidden. |
| **Sound engineering** (architecture, edge cases, deployment plan) | Strong: about 260 tests, typed end to end, retention, audit trail, provider failover, ETag polling. | New behaviour is covered by tests: demo-board opt-in and privacy, nurse seeding, same-slot counterfactual, emergency line mapping, public survey stats, reason de-duplication. |
| **Bonus: feedback from real users** | Collected, but only admins could see it. | Shown publicly and live (see Problem validation). |
| **Bonus: costed plan at scale** | `docs/cost.md` | Unchanged. |

## Why it wins

- **One real workflow, both sides.** A phone check feeds a live hospital board, and the doctor opens a pre-consult card instead of starting from zero. This is not a mock-up.
- **Measured, not claimed.** The time saved is computed from the queue's own timestamps against a stated counterfactual, on screen.
- **Privacy by construction.** Face video and eye photos stay on the phone. Public demo staff never see a citizen's visit unless that citizen opts in.
- **Local fit.** Hindi, Chhattisgarhi and English, Hinglish symptom parsing on the device, 108 for emergencies, and Jan Aushadhi generics.

## Where it could still fail (and what mitigates it)

| Risk | Mitigation in the product | Still open |
|---|---|---|
| Judges doubt the "3-minute" claim. The full check honestly takes about 8 minutes. | Quick check (pulse, eyes, symptoms), about 3 minutes, is the default. Vision and hearing are offered on the Health Card as optional add-ons. The step header shows the real time left. | Timing is estimated per step, not measured from real sessions. |
| rPPG or eye check fails in a dark hall. | Quality gate, spoken guidance, skip, desk fallback ("take pulse at the desk") on the doctor's card. | Needs good light at the venue. |
| AI provider slow or down. | Symptoms parse on the device at once; the AI refinement is capped at 5 s; red flags are the union of rules and AI. | — |
| No real user quotes. | Live survey numbers on the landing page. | Record 3 consented quotes at the event and fill them into `docs/validation.md`. |
| The anaemia flag is wrong for an individual. | Framed as "get an Hb test", sensitivity-first, with a model card. | Field validation on local patients. |

## Changes made

**Fixes**
- Same-capacity first-come counterfactual (`apps/api/src/lib/impact.ts`). The old model could report that priority made urgent patients wait longer.
- Emergency bypass compared against the General Medicine line it replaces.
- "Fever for 3 days" no longer also listed as plain "Fever" (`packages/core/src/triage.ts`).
- Health Card: the duplicate anaemia row is removed. The 3D callout labels no longer run off the card on phones. Pages open at the top.
- Scan step toast no longer covers the "Step n of m" line.
- The demo doctor and nurse PINs are no longer stuck on an empty board.

**Stronger systems**
- Quick and Full check plans. Any skipped or unplanned test can be added from the Health Card, and the queued visit is re-triaged.
- Live impact strip on the board and impact panel on the admin dashboard.
- Opt-in "Show my visit on the demo board" (`tokens.demo_visible`, migration `0007`).
- Public survey evidence (`GET /api/stats/public` now returns survey aggregates).
- Symptoms parse instantly on the device and the AI refines them in the background.

**UI/UX**
- Health Card leads with the verdict and the one next action (Join queue, View my token, or Call 108), then the reasons. Measurements, "At the desk" items and "Add a check" follow; decorative 3D views come last.
- Queue screen: the opt-in sits above the hospital list, and there is a direct "Open my health card" button.
- Plan picker on the profile screen with honest time estimates.
- New strings in English and Hindi (Chhattisgarhi falls back to Hindi).

## How to re-run the audit

```sh
pnpm typecheck && pnpm test
pnpm --filter @niktan/api db:migrate:local   # applies 0007_demo_visible
```

Then follow `docs/demo-script.md`: run a quick check on a phone, join a demo hospital with **Show my visit on the demo board** ticked, open `/hospital/board` with any demo PIN, press **Demo scenario**, call a few patients, and watch the impact strip.
