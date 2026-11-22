import os, sys, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, features as F
OUT = os.environ.get('NIKTAN_OUT', os.path.dirname(os.path.abspath(__file__)))
model = json.load(open(OUT + '/anemiaModel.json'))
rng = np.random.default_rng(2024)
def patch(h, w, base, sd):
    return np.clip(np.round(rng.normal(base, sd, size=(h, w, 3))), 0, 255).astype(np.uint8)
cases = []
# 1: pale conjunctiva, full mask, with highlight + shadow pixels that must be dropped
a = patch(8, 8, (214, 158, 152), 6); a[0, 0] = (255, 252, 250); a[0, 1] = (251, 240, 238); a[7, 7] = (12, 6, 6)
cases.append(('pale_full_mask', a, np.ones((8, 8), bool)))
# 2: well-perfused red conjunctiva, explicit mask (left two columns masked out)
b = patch(8, 8, (186, 78, 84), 8); m = np.ones((8, 8), bool); m[:, :1] = False; b[:, 0] = (0, 255, 0)
b2 = np.concatenate([b, patch(8, 1, (186, 78, 84), 8)], axis=1); m2 = np.concatenate([m, np.ones((8, 1), bool)], axis=1)
cases.append(('red_explicit_mask', b2, m2))
# 3: 16x16 with no mask -> centre crop rows/cols 4..11; outside is pure green and must be ignored
c = np.zeros((16, 16, 3), np.uint8); c[:] = (0, 200, 0); c[4:12, 4:12] = patch(8, 8, (172, 112, 106), 7)
cases.append(('intermediate_centre_crop', c, None))
out = {'description': 'Golden vectors for the NikTan anaemia feature pipeline + model. Images are row-major HxWx3 uint8 sRGB; mask is HxW (1 = conjunctiva) or null (use centre crop rows floor(H/4)..floor(3H/4)-1, cols likewise). Compare features with abs tol 1e-9 and probability with abs tol 1e-9.',
       'modelVersion': model['version'], 'constants': {'HIGHLIGHT_MAX': F.HIGHLIGHT_MAX, 'SHADOW_MIN': F.SHADOW_MIN, 'MIN_PIXELS': F.MIN_PIXELS},
       'cases': []}
for name, img, mask in cases:
    px = F.select_pixels(img, mask)
    f = F.features_from_pixels(px)
    x = F.feature_vector(f, model['features'])
    z = (x - np.array(model['standardization']['mean'])) / np.array(model['standardization']['std'])
    logit = float(np.dot(model['coefficients'], z) + model['intercept'])
    p = F.predict_proba(x, model)
    lab = F.rgb8_to_lab(px[:3])
    out['cases'].append({'name': name, 'height': img.shape[0], 'width': img.shape[1], 'pixels': img.tolist(),
        'mask': None if mask is None else mask.astype(int).tolist(), 'nKeptPixels': int(len(px)),
        'firstKeptPixels': px[:3].tolist(), 'firstKeptPixelsLab': lab.tolist(),
        'features': f, 'standardized': z.tolist(), 'logit': logit, 'probability': p,
        'flagAnaemia': bool(p >= model['threshold'])})
    print(name, len(px), {k: round(v, 3) for k, v in f.items()}, round(p, 4), p >= model['threshold'])
# extra: unit tests of colour conversion on reference colours
refs = {'white': [255, 255, 255], 'black': [0, 0, 0], 'red': [255, 0, 0], 'mid_grey': [128, 128, 128], 'skin': [200, 150, 130]}
out['labReference'] = {k: F.rgb8_to_lab(np.array([v])).tolist()[0] for k, v in refs.items()}
json.dump(out, open(OUT + '/golden.json', 'w'), indent=1)
print(out['labReference'])
