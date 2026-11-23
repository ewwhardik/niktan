# Anaemia (conjunctival pallor) model

A blend of logistic regression and 200 depth-2 boosted trees on 11 colour features of the lower-eyelid
conjunctiva. The logit is `0.3 × trees + 0.7 × logistic`. The app runs the same features and both
models in the browser (`apps/web/src/cv/anemia.ts`); `golden.py` writes test vectors that keep the Python
and TypeScript code identical to 1e-9.

## Data (not included in this repo)

| Dataset | Source | Licence |
|---|---|---|
| ML IDA Conjunctiva Dataset from Ghana (514 unique images after de-duplication) | Asare, Appiahene, Donkoh, Mendeley Data V1, 2022, [doi:10.17632/nt7r8hv2pz.1](https://doi.org/10.17632/nt7r8hv2pz.1) | CC BY 4.0 |
| Eyes-defy-anemia (95 India + 122 Italy adults, lab Hb) | Dimauro, Maglietta, Bai, Kasiviswanathan, IEEE DataPort, 2022, [doi:10.21227/t5s2-4j73](https://doi.org/10.21227/t5s2-4j73) | CC BY 4.0 |

Also cite Dimauro et al., *Artificial Intelligence in Medicine* 136:102477 (2023) and Appiahene et al.,
*Medicine in Novel Technology and Devices* 18:100244 (2023). Only derived coefficients ship with the
app; no images are redistributed.

## Reproduce

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install numpy pandas scikit-learn pillow openpyxl
export NIKTAN_ANEMIA_DATA=~/niktan-datasets/anemia   # the two datasets above, unzipped
python extract.py training_table.csv
python train.py training_table.csv .
python golden.py
```

## Results (patient-grouped stratified 5-fold CV, threshold chosen inside each fold)

| Model | n (anaemic) | AUC [95% CI] | Sensitivity | Specificity [95% CI] |
|---|---|---|---|---|
| **v2 blend (shipped)** | 731 (382) | **0.743 [0.71–0.78]** | 0.84 | **0.43 [0.38–0.48]** |
| v1 logistic | 731 (382) | 0.707 [0.67–0.75] | 0.85 | 0.39 [0.34–0.44] |
| Boosted trees alone | 731 (382) | 0.770 [0.74–0.81] | 0.86 | 0.48 [0.43–0.54] |

| v2 blend by subset | n (anaemic) | AUC | Sensitivity | Specificity |
|---|---|---|---|---|
| Ghana children | 514 (291) | 0.67 | 0.83 | 0.27 |
| India adults | 95 (68) | 0.67 | 0.88 | 0.26 |
| Italy adults | 122 (23) | 0.92 | 0.83 | 0.83 |

Why not trees alone: trained on one country and tested on the other, trees transfer worse than the
logistic model (AUC 0.52 vs 0.70 Ghana→adults, 0.54 vs 0.60 adults→Ghana). The 0.3 blend keeps
transfer close to logistic (0.68 and 0.59) while gaining most of the pooled improvement. NikTan's users
and phones are not in the training data, so transfer matters more than the pooled score.

Tried and not shipped: 11 extra colour-distribution features (spread, high-erythema fraction, chroma,
hue, saturation) and the forniceal and combined crops of each adult patient as extra training images.
Neither improved grouped CV. The `eMoglobin` spreadsheet (Zenodo 8277462) holds fingernail-app
metadata without eye images, so it cannot train this model.

The threshold favours sensitivity (missing anaemia is worse than an extra ₹50–100 Hb test), so the
app only ever says "consider an Hb blood test". Full numbers are in `metrics.json`.

## Limitations

- Phone auto white balance is not corrected; lighting changes the colour.
- Few Indian samples (95 adults, no children).
- Child binary labels and adult Hb labels are pooled.
- Skin pigmentation, conjunctivitis and kajal are not modelled.
- The app's automatic crop is rougher than the hand-made training masks.
