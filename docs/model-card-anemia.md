# Model Card: Conjunctival Pallor Risk Estimator

> **Model Identifier:** `niktan-pallor-v1`  
> **Model Type:** Regularized Logistic Regression with scikit-learn StandardScaler (z-scores)  
> **Input:** 11 standardized (z-scored) colorimetric and photometric features extracted from palpebral conjunctiva crop  
> **Output:** Binary screening flag (`pallor_detected` vs `normal`) + Continuous Risk Score $[0.0, 1.0]$  
> **Implementation:** In-browser pure TypeScript (`apps/web/src/cv/anemia.ts`) and Python (`ml/anemia/features.py`)

---

## 1. Intended Use & Clinical Scope

- **Intended Use:** Assistive triage flag to screen outpatients waiting in hospital OPDs for potential pallor indicative of nutritional or chronic anemia.
- **Intended User:** Citizen self-screening on mobile browser or OPD triage nursing staff.
- **Out of Scope / Prohibited Use:** **Diagnostic use.** This model MUST NOT be used to prescribe treatments, calculate iron dosage, or bypass formal laboratory haemoglobin (Hb) / complete blood count (CBC) testing.

---

## 2. Feature Pipeline (11 Colorimetric Descriptors)

The eye scan pipeline crops the lower-eyelid palpebral conjunctiva region using MediaPipe facial landmarks, computes colour statistics on the conjunctiva pixels, and passes 11 deterministic features to a blend of a logistic regression (on z-scored features) and 200 depth-2 boosted trees; the final logit is 0.7 × logistic + 0.3 × trees. The features, in model order:

1. `a_mean`: mean CIELAB $a^*$ (redness-greenness) of conjunctiva pixels.
2. `a_median`: median CIELAB $a^*$.
3. `a_p25`: 25th percentile of $a^*$.
4. `a_p75`: 75th percentile of $a^*$.
5. `L_mean`: mean CIELAB $L^*$ (lightness).
6. `L_median`: median CIELAB $L^*$.
7. `b_mean`: mean CIELAB $b^*$ (yellowness-blueness).
8. `ei_mean`: mean erythema index.
9. `ei_median`: median erythema index.
10. `rch_mean`: mean red chromaticity.
11. `gr_mean`: mean green/red ratio.

Parity between Python feature extraction and browser TypeScript execution is strictly validated to $< 10^{-9}$ numerical precision using golden vector unit tests (`apps/web/test/anemia.test.ts`).

---

## 3. Training & Validation Datasets

| Dataset | Sample Count ($n$) | Cohort Demographics | Ground Truth Label | Licence |
|---|---|---|---|---|
| **Eyes-defy-anemia** | 217 adults (95 India, 122 Italy) | Hospital outpatients and healthy volunteers | Quantitative venous lab Hb ($g/dL$) | CC BY 4.0 ([DOI: 10.21227/t5s2-4j73](https://doi.org/10.21227/t5s2-4j73)) |
| **ML IDA Ghana** | 514 children (deduplicated) | Pediatric clinic visits (6–59 months) | Clinical WHO cutoff ($Hb < 11.0 g/dL$) | CC BY 4.0 ([DOI: 10.17632/nt7r8hv2pz.1](https://doi.org/10.17632/nt7r8hv2pz.1)) |
| **Pooled Total** | **731 samples (382 anemic)** | Heterogeneous multi-site cohort | Binary clinical label | Open Academic Research |

---

## 4. Quantitative Performance Metrics

Evaluated using **patient-grouped stratified 5-fold cross-validation** (leakage prevention: no patient's images span both train and validation folds):

| Cohort Subset | Samples ($n$) | Anemic ($n_{pos}$) | ROC-AUC [95% CI] | Sensitivity | Specificity | False Negative Rate |
|---|---|---|---|---|---|---|
| **All Combined (v2 blend, shipped)** | **731** | **382** | **0.743 [0.71–0.78]** | **84.0%** | **43.0%** | **16.0%** |
| India Adults | 95 | 68 | 0.674 | 88.2% | 25.9% | 11.8% |
| Italy Adults | 122 | 23 | 0.924 | 82.6% | 82.8% | 17.4% |
| Ghana Children | 514 | 291 | 0.672 | 83.2% | 27.4% | 16.8% |
| *v1 logistic, for comparison* | 731 | 382 | 0.707 [0.67–0.75] | 85.1% | 38.7% | 14.9% |
| *Boosted trees alone* | 731 | 382 | 0.770 [0.74–0.81] | 85.9% | 48.4% | 14.1% |

Trees alone fit the pooled data best but transfer poorly between countries (trained on Ghana and tested on adults: AUC 0.52 vs 0.70 for logistic). The 0.3 blend keeps transfer near the logistic model (0.68) while gaining most of the pooled improvement. Also tried and not shipped: 11 extra colour-distribution features, and forniceal and combined crops as extra training images; neither improved grouped CV.

### Strategic Threshold Calibration
In public outpatient screening, the clinical cost of a **False Negative** (missing an anemic mother or child who continues untreated) is far higher than a **False Positive** (advising an unnecessary ₹50 confirmatory capillary/venous Hb test). Therefore, the decision threshold is deliberately tuned for **high sensitivity ($\ge 85\%$)**.

---

## 5. Limitations & Caveats

1. **Ambient Lighting Sensitivity:** Changes in color temperature (incandescent warm vs. fluorescent cool) can shift the chromaticity coordinates. The app instructs users to position themselves facing natural diffuse window light.
2. **Kajal / Cosmetics Interference:** Traditional eye cosmetics (kajal/surma) along the lower waterline can distort color distributions.
3. **Regional Representation:** While Indian adult samples are included, larger regional datasets from rural Central India will improve calibration in future iterations.
