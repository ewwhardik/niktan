"""
NikTan conjunctival-pallor colour features -- reference implementation.

This file is the single source of truth for the TypeScript port. Every
constant and every step below must be reproduced verbatim; golden.json holds
test vectors produced by this exact code.

Pipeline (per photo)
--------------------
input : H x W x 3 uint8 sRGB pixels of the lower-eyelid (palpebral)
        conjunctiva + optional boolean mask (H x W). If no mask is provided,
        a centre crop of the middle 50 % width x 50 % height is used.
1. Pixel selection: keep pixel if mask is true AND
       max(R,G,B) <  HIGHLIGHT_MAX (250)   -> drops specular glints and white
                                              background
       max(R,G,B) >  SHADOW_MIN    (20)    -> drops black background/shadow
   If fewer than MIN_PIXELS (50) pixels survive, the image is rejected.
2. White balance: OPTIONAL and OFF for the shipped model (wb = "none").
   The training data has no consistent reference region (sclera / white
   card), and grey-world on the conjunctiva itself would erase exactly the
   red-vs-green signal we are measuring. `grey_world_gains` is provided for
   the app to use only on a separate reference region if a future model is
   trained with it.
3. Per-pixel quantities (all in float64):
       sRGB -> linear: c = v/255; lin = c/12.92 if c <= 0.04045
                                   else ((c+0.055)/1.055)**2.4
       linear -> XYZ (IEC 61966-2-1, D65):
           X = 0.4124564 R + 0.3575761 G + 0.1804375 B
           Y = 0.2126729 R + 0.7151522 G + 0.0721750 B
           Z = 0.0193339 R + 0.1191920 G + 0.9503041 B
       XYZ -> CIELAB with reference white D65 (Xn,Yn,Zn) =
           (0.95047, 1.00000, 1.08883):
           d = 6/29
           f(t) = t ** (1/3)                 if t > d**3
                  t / (3 d**2) + 4/29        otherwise
           L* = 116 f(Y/Yn) - 16
           a* = 500 (f(X/Xn) - f(Y/Yn))
           b* = 200 (f(Y/Yn) - f(Z/Zn))
       Erythema index (8-bit values, +1 avoids log 0):
           EI  = 100 * log10((R + 1) / (G + 1))
       Red chromaticity:  rch = R / (R + G + B)        (R+G+B > 0 guaranteed
                                                        by SHADOW_MIN)
       Green/red ratio:   gr  = (G + 1) / (R + 1)
4. Aggregation over kept pixels:
       mean     = arithmetic mean
       pXX      = linear-interpolated percentile on the ascending-sorted
                  values: pos = (n-1)*q, lo = floor(pos), hi = ceil(pos),
                  v = s[lo] + (s[hi]-s[lo])*(pos-lo)  (numpy "linear")
       median   = p50
5. Feature vector, in this order (FEATURE_NAMES).
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence

import numpy as np

HIGHLIGHT_MAX = 250
SHADOW_MIN = 20
MIN_PIXELS = 50

# sRGB -> XYZ (D65), IEC 61966-2-1 / Lindbloom
M_RGB2XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ],
    dtype=np.float64,
)
WHITE_D65 = (0.95047, 1.00000, 1.08883)
LAB_DELTA = 6.0 / 29.0

FEATURE_NAMES: List[str] = [
    "a_mean",
    "a_median",
    "a_p25",
    "a_p75",
    "L_mean",
    "L_median",
    "b_mean",
    "ei_mean",
    "ei_median",
    "rch_mean",
    "gr_mean",
]


def srgb_to_linear(v8: np.ndarray) -> np.ndarray:
    c = v8.astype(np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _lab_f(t: np.ndarray) -> np.ndarray:
    d3 = LAB_DELTA ** 3
    return np.where(t > d3, np.cbrt(t), t / (3.0 * LAB_DELTA ** 2) + 4.0 / 29.0)


def rgb8_to_lab(rgb8: np.ndarray) -> np.ndarray:
    """rgb8: (N,3) uint8/int -> (N,3) float64 [L*, a*, b*]."""
    lin = srgb_to_linear(rgb8)
    xyz = lin @ M_RGB2XYZ.T
    fx = _lab_f(xyz[:, 0] / WHITE_D65[0])
    fy = _lab_f(xyz[:, 1] / WHITE_D65[1])
    fz = _lab_f(xyz[:, 2] / WHITE_D65[2])
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return np.stack([L, a, b], axis=1)


def percentile(values: np.ndarray, q: float) -> float:
    """Linear-interpolated percentile, q in [0,1] (identical to numpy 'linear')."""
    s = np.sort(values)
    pos = (len(s) - 1) * q
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    return float(s[lo] + (s[hi] - s[lo]) * (pos - lo))


def centre_crop_mask(h: int, w: int) -> np.ndarray:
    """Middle 50% x 50% box: rows [floor(h/4), floor(3h/4)), cols likewise."""
    m = np.zeros((h, w), dtype=bool)
    m[h // 4 : (3 * h) // 4, w // 4 : (3 * w) // 4] = True
    return m


def grey_world_gains(ref_rgb8: np.ndarray) -> np.ndarray:
    """Per-channel gains making the mean of a REFERENCE region neutral grey.
    gain_c = mean(R,G,B over ref) / mean_c. Apply as clip(round(v*gain),0,255).
    Not used by anemiaModel.json v1 (wb = "none")."""
    m = ref_rgb8.reshape(-1, 3).astype(np.float64).mean(axis=0)
    return m.mean() / np.maximum(m, 1e-6)


def select_pixels(rgb8: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
    """rgb8: (H,W,3) uint8. Returns (N,3) int array of kept pixels."""
    h, w = rgb8.shape[:2]
    if mask is None:
        mask = centre_crop_mask(h, w)
    px = rgb8[mask].astype(np.int64)
    mx = px.max(axis=1)
    keep = (mx < HIGHLIGHT_MAX) & (mx > SHADOW_MIN)
    return px[keep]


def features_from_pixels(px: np.ndarray) -> Dict[str, float]:
    """px: (N,3) integer sRGB 0..255 (already selected). Returns feature dict."""
    px = np.asarray(px, dtype=np.int64).reshape(-1, 3)
    if len(px) < MIN_PIXELS:
        raise ValueError(f"too few conjunctiva pixels: {len(px)} < {MIN_PIXELS}")
    lab = rgb8_to_lab(px)
    R = px[:, 0].astype(np.float64)
    G = px[:, 1].astype(np.float64)
    B = px[:, 2].astype(np.float64)
    ei = 100.0 * np.log10((R + 1.0) / (G + 1.0))
    rch = R / (R + G + B)
    gr = (G + 1.0) / (R + 1.0)
    L, a, b = lab[:, 0], lab[:, 1], lab[:, 2]
    return {
        "a_mean": float(a.mean()),
        "a_median": percentile(a, 0.5),
        "a_p25": percentile(a, 0.25),
        "a_p75": percentile(a, 0.75),
        "L_mean": float(L.mean()),
        "L_median": percentile(L, 0.5),
        "b_mean": float(b.mean()),
        "ei_mean": float(ei.mean()),
        "ei_median": percentile(ei, 0.5),
        "rch_mean": float(rch.mean()),
        "gr_mean": float(gr.mean()),
    }


def feature_vector(feats: Dict[str, float], names: Sequence[str] = FEATURE_NAMES) -> np.ndarray:
    return np.array([feats[n] for n in names], dtype=np.float64)


def tree_logit(x: Sequence[float], model: dict) -> float:
    """Boosted trees (model kind "gbm"): baseline + sum of one leaf value per tree."""
    total = float(model["baseline"])
    for tr in model["trees"]:
        i = 0
        while tr["f"][i] >= 0:
            v = x[tr["f"][i]]
            left = bool(tr["m"][i]) if math.isnan(v) else v <= tr["t"][i]
            i = tr["l"][i] if left else tr["r"][i]
        total += tr["v"][i]
    return total


def predict_proba(x: np.ndarray, model: dict) -> float:
    """model = parsed anemiaModel.json. Logistic (v1): z = (x-mean)/std; p = 1/(1+exp(-(w.z+b))).
    Blend (v2): the logit mixes the tree and logistic logits; see model_logit."""
    return 1.0 / (1.0 + math.exp(-model_logit(x, model)))


def model_logit(x: np.ndarray, model: dict) -> float:
    """Logit of either model kind. "blend" mixes the tree and logistic logits by gbmWeight."""
    names = model["features"]
    x = np.asarray(x, dtype=np.float64)[: len(names)]
    mu = np.array(model["standardization"]["mean"], dtype=np.float64)
    sd = np.array(model["standardization"]["std"], dtype=np.float64)
    w = np.array(model["coefficients"], dtype=np.float64)
    z = (x - mu) / sd
    logit = float(np.dot(w, z) + model["intercept"])
    if model.get("kind") == "blend":
        k = float(model["gbmWeight"])
        return k * tree_logit(x, model) + (1 - k) * logit
    return logit


def load_rgba_png(path: str):
    """Dataset helper (not needed in the app): returns rgb8 (H,W,3) and mask
    from alpha (alpha > 127) when alpha varies, else None (pixel rules then
    remove white/black backgrounds)."""
    from PIL import Image, ImageFile, PngImagePlugin

    PngImagePlugin.MAX_TEXT_CHUNK = 100 * 2 ** 20
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    im = Image.open(path)
    im.load()
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        arr = np.array(im.convert("RGBA"))
        alpha = arr[..., 3]
        mask = alpha > 127 if alpha.min() != alpha.max() else np.ones(alpha.shape, bool)
        return arr[..., :3], mask
    arr = np.array(im.convert("RGB"))
    return arr, np.ones(arr.shape[:2], bool)
