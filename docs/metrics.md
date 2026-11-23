# Prototype evaluation

| Question | Result | Evidence |
|---|---|---|
| Does an urgent arrival move forward? | With 14 routine visits waiting, token 15 moves from 15th in arrival order to 1st under priority ordering. | Automated D1 integration test with synthetic visits in an idle General Medicine queue at `demo-chc`. [Test fixture and assertions](../apps/api/test/d1.test.mjs) |
| How does the board compare waiting times? | It assigns the same doctor call slots to patients in arrival order, then compares wait by priority. Emergency bypasses enter the comparison in General Medicine. Routine waits can increase. | Timestamp-based counterfactual. Check the real-only subset separately from simulated visits. [Implementation](../apps/api/src/lib/impact.ts) |
| How well does the pallor flag perform? | The v2 blend achieved AUC 0.743, sensitivity 84% and specificity 43% in grouped cross-validation on 731 pooled samples. False referrals are common at this threshold. | Retrospective model evaluation. Local clinical performance remains open. [Model card](model-card-anemia.md) |
| How long does screening take? | The product estimates about 3 minutes for pulse, eyes and symptoms, or 8 minutes with vision and hearing. | Per-step estimates. A timed field pilot would establish completion times and dropout. |
| What could a screening cost to operate? | The scale model estimates ₹2,190 per 100,000 screenings, about ₹0.022 each. | Server-cost scenario with assumed usage. Devices, data and staffing are additional. [Cost assumptions](cost.md) |

## Reproduce the queue result

Run `pnpm --filter @niktan/api test` from the repository root. The test named **a see-today patient arriving 15th ranks first in an idle medicine queue** seeds 14 waiting visits, submits three days of fever for the next patient, then checks the unchanged token number, assigned priority, number ahead and arrival order. The fixture measures rank. The board’s minutes comparison requires recorded call times.

## Outcomes to measure in the OPD

Time the doctor’s intake with and without a pre-consult card. Record time to call separately for each priority group, including routine visits. Report queue size, staffing, completed checks and sample size alongside the result. The repository records a proposed intake target of 0.5–1 minute. Field intake savings and daily screening throughput remain unmeasured. [Problem evidence and feedback snapshot](validation.md)
