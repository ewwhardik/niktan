# Anaemia (conjunctival pallor) model

Logistic regression on 11 colour features of the lower-eyelid conjunctiva. The app runs the same
features in the browser (`apps/web/src/cv/anemia.ts`); `golden.py` writes test vectors that keep
the Python and TypeScript code identical to 1e-9.

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

| Subset | n (anaemic) | AUC [95% CI] | Sensitivity | Specificity |
|---|---|---|---|---|
| All | 731 (382) | 0.707 [0.67–0.75] | 0.85 | 0.39 [0.34–0.44] |
| Ghana children | 514 (291) | 0.64 | 0.85 | 0.22 |
| India adults | 95 (68) | 0.68 | 0.84 | 0.30 |
| Italy adults | 122 (23) | 0.91 | 0.87 | 0.80 |

The threshold favours sensitivity (missing anaemia is worse than an extra ₹50–100 Hb test), so the
app only ever says "consider an Hb blood test". Full numbers are in `metrics.json`.

## Limitations

- Phone auto white balance is not corrected; lighting changes the colour.
- Few Indian samples (95 adults, no children).
- Child binary labels and adult Hb labels are pooled.
- Skin pigmentation, conjunctivitis and kajal are not modelled.
- The app's automatic crop is rougher than the hand-made training masks.
