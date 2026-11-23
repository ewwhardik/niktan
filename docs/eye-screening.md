# Jaundice and cataract screening (v2)

Both checks combine **what the camera measures** with **what the person reports**, using deterministic, tested rules in `packages/core/src/eyeRisk.ts`. Neither camera signal is trusted on its own at its weaker level. Each result is low, possible or likely, and is always phrased as "get it checked", never as a diagnosis.

## What was wrong with v1

| | v1 | Problem |
|---|---|---|
| Cataract | Bright-pupil heuristic that ran only when the camera torch was on | The eye scan uses the front camera, which has no torch, so the check almost never ran ("Not checked"). |
| Jaundice | Raw sclera CIELAB b* ≥ 20 | No colour correction: a warm household bulb tints a healthy eye yellow. The sclera was sampled as a horizontal band that could include eyelid skin. |

## Jaundice

**Method** (after BiliScreen, Mariakakis et al., UbiComp 2017, and neoSCB, Outlaw et al., 2020): bilirubin absorbs blue light, so a jaundiced sclera loses blue and its yellowness (CIELAB b*) rises.

1. **Sclera segmentation:** pixels inside the eyelid contour (MediaPipe landmarks), outside 1.15 iris radii. Clipped glints, lashes and shadows (L* < 30) and red vessels or the caruncle (a* > eye median + 4) are removed. The median comes from the 10th–60th brightest-percentile band.
2. **White reference:** a plain white paper held under the chin is detected automatically. It must be bright, about as neutral as the sclera (skin is much redder, so it is rejected) and even in colour. The sclera colour is divided by the paper's colour in linear light (von Kries), which cancels the room light's colour, and normalised to a fixed lightness so exposure does not matter.
3. **Screen flash:** the screen turns white for about 0.6 s while three frames are read. Medians across frames, and across both eyes, are used. Eyes that disagree by more than 6 b* units lower the level by one step.
4. **Fusion:** "Has anyone said your eyes look yellow?" and "Is your urine dark?"

| White-referenced b* | Image level |
|---|---|
| < 15 | low |
| 15–21 | possible |
| ≥ 21 | likely |
| no reference: ≥ 24 | possible at most |

Final level: **likely** if the image is likely, or the image is possible plus one symptom, or both symptoms are reported. **Possible** if either one alone. Likely jaundice makes the visit *see today* in General Medicine; possible is a routine reminder ("recheck in daylight").

Synthetic check (`apps/web/test/eyeColour.test.ts`):

| Case | b* |
|---|---|
| Healthy eye, neutral light | ~3.6 |
| Healthy eye, 3000 K bulb, no paper | ~20.8 (stays below the 24 no-paper cutoff) |
| Same eye with paper | ~3.6 |
| Aged off-white eye | ~10.7 |
| Jaundiced eye, with or without warm light | > 21 |

## Cataract

1. **Pupil opacity:** a clear lens leaves the pupil black; a cataract scatters light back, so the pupil looks grey or white. The centre 0.25 iris radii (inside even a constricted pupil) is read, without the screen's reflection, and divided by the same eye's sclera lightness. Using the sclera rather than the iris means a dark brown iris does not hide the effect. A red or orange glow (the retina seen through a clear lens) counts as clear. Opacity ≥ 0.30 is possible; ≥ 0.45 is likely.
2. **Glare-disability test** (vision step, age 40+): the Pelli-Robson-style contrast letters again on a mid-grey card inside a full-white ring five times brighter, the principle behind clinical glare testers. A clouded lens scatters the ring's light over the letter. A drop of ≥ 0.3 log units from the plain contrast score counts. The test is skipped when the plain score is already below 0.9, because a drop could not show.
3. **Symptoms** (age 40+): cloudy or foggy vision; glare or halos at night.
4. **Acuity** worse than 6/12, from the vision test.

Final level: **likely** if the image is likely, or the image is possible plus any functional sign, or (age 50+ with a lens-specific sign and three functional signs). **Possible** if the image is possible, or two functional signs including a lens-specific one, or age 50+ with a lens-specific sign. Either level routes to Ophthalmology.

Scope: the photo targets **visible (mature) cataract**, the backlog India's National Programme for Control of Blindness is working through. Early cataract is invisible to a phone camera; for that the glare test, symptoms and acuity carry the result.

## Limitations and validation plan

- The thresholds are provisional: no labelled local photos exist yet. They were chosen from colour-science reasoning and synthetic tests to keep false positives low.
- Phone screens and cameras differ. The white reference corrects the light's colour, not each sensor's colour response.
- **Validation:** pair NikTan readings with serum bilirubin in a medicine OPD, and with slit-lamp grading in an eye OPD. Report sensitivity and specificity per level, then tune the thresholds in `EYE_RULES`.
