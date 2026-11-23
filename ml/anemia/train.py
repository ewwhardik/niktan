import os, sys, re, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd
import features as F
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import roc_auc_score

IN, OUT = sys.argv[1], sys.argv[2]
TARGET_SENS = 0.85
rng = np.random.default_rng(0)
d = pd.read_csv(IN)

# ---------------- Ghana: dedupe & group ----------------
g = d[d.dataset == 'ghana'].copy()
def stem(f):
    f = re.sub(r'\.png$', '', f); f = re.sub(r' - Copy.*$', '', f); f = re.sub(r' \(\d+\)', '', f)
    f = re.sub(r'-[A-Za-z0-9]{6}$', '', f); f = re.sub(r'png$', '', f); f = re.sub(r'(FV|RA|R)$', '', f)
    return f.strip()
g['stem'] = g.file.map(stem)
par = {}
def find(x):
    par.setdefault(x, x)
    while par[x] != x:
        par[x] = par[par[x]]; x = par[x]
    return x
def union(a, b): par[find(a)] = find(b)
for _, r in g.iterrows(): union('k:' + r.ckey, 's:' + r.stem)
u = g.sort_values('file').groupby('ckey').first().reset_index()
Xn = u[['a_mean', 'L_mean', 'b_mean', 'ei_mean', 'rch_mean']].values
Xn = (Xn - Xn.mean(0)) / Xn.std(0)
D = np.sqrt(((Xn[:, None] - Xn[None]) ** 2).sum(-1)); np.fill_diagonal(D, 9)
for i, j in zip(*np.where(D < 0.05)): union('k:' + u.ckey[i], 'k:' + u.ckey[j])
u['group'] = ['ghana:' + find('k:' + k) for k in u.ckey]
ghana_info = dict(files=int(len(g)), unique_images=int(len(u)), groups=int(u.group.nunique()),
                  anaemic_unique=int((u.label == 1).sum()), non_anaemic_unique=int((u.label == 0).sum()))
# a group with mixed labels would be dropped
mixed = u.groupby('group').label.nunique(); assert (mixed > 1).sum() == 0, 'mixed label groups'

# ---------------- Eyes-defy-anemia ----------------
e = d[d.dataset != 'ghana'].copy()
e = e[e.hb.notna()]
e['label'] = np.where(e.sex == 'F', e.hb < 12.0, e.hb < 13.0).astype(int)
e['group'] = e.file.map(lambda f: 'eda:' + '/'.join(f.split('/')[:2]))
data = pd.concat([u[['dataset', 'file', 'label', 'group'] + F.FEATURE_NAMES].assign(hb=np.nan),
                  e[['dataset', 'file', 'label', 'group', 'hb'] + F.FEATURE_NAMES]], ignore_index=True)
data['label'] = data.label.astype(int)
data.to_csv(OUT + '/training_table.csv', index=False)
X = data[F.FEATURE_NAMES].values; y = data.label.values; grp = data.group.values; ds = data.dataset.values
strat = np.array([f'{a}_{b}' for a, b in zip(ds, y)])

# ---------------- helpers ----------------
def wilson(k, n, z=1.96):
    if n == 0: return (float('nan'),) * 3
    p = k / n; den = 1 + z * z / n; c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return p, max(0, c - h), min(1, c + h)

def boot_auc(y, p, groups, B=2000, seed=1):
    r = np.random.default_rng(seed); ug = np.unique(groups); idx = {k: np.where(groups == k)[0] for k in ug}
    out = []
    for _ in range(B):
        s = np.concatenate([idx[k] for k in r.choice(ug, len(ug))])
        if len(np.unique(y[s])) < 2: continue
        out.append(roc_auc_score(y[s], p[s]))
    return float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))

def thr_for_sens(y, p, target=TARGET_SENS):
    """Largest threshold t such that sensitivity(p >= t) >= target."""
    pos = np.sort(p[y == 1])[::-1]
    k = int(math.ceil(target * len(pos)))
    return float(pos[k - 1])

GBM_WEIGHT = 0.3  # share of the tree logit in the shipped blend


class Blend:
    """Logit blend of the logistic model and the boosted trees. Trees alone score higher in pooled CV
    but transfer worse across countries; at 0.3 the blend keeps most of the gain and the transfer."""
    def __init__(self, C=1.0):
        self.lr = make('lr', C); self.gbm = make('gbm')
    def fit(self, X, y):
        self.lr.fit(X, y); self.gbm.fit(X, y); return self
    def predict_proba(self, X):
        lg = lambda p: np.log(np.clip(p, 1e-12, 1) / np.clip(1 - p, 1e-12, 1))
        z = GBM_WEIGHT * lg(self.gbm.predict_proba(X)[:, 1]) + (1 - GBM_WEIGHT) * lg(self.lr.predict_proba(X)[:, 1])
        p = 1 / (1 + np.exp(-z)); return np.stack([1 - p, p], axis=1)


def make(kind, C=1.0):
    if kind == 'blend':
        return Blend(C)
    if kind == 'lr':
        return make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=5000))
    # Chosen by grouped 5x5-fold CV over depth 1-3, 150-400 trees and leaf sizes 20-40: near-best AUC
    # with the smallest trees and lowest fold-to-fold variance.
    return HistGradientBoostingClassifier(max_depth=2, max_iter=200, learning_rate=0.05, min_samples_leaf=40, l2_regularization=1.0, random_state=0)

def cv_oof(kind, X, y, grp, strat, C=1.0, seed=42, nested_thr=True):
    oof = np.zeros(len(y)); thr_used = np.zeros(len(y))
    sgk = StratifiedGroupKFold(5, shuffle=True, random_state=seed)
    for tr, te in sgk.split(X, strat, grp):
        m = make(kind, C).fit(X[tr], y[tr]); oof[te] = m.predict_proba(X[te])[:, 1]
        if nested_thr:
            inner = np.zeros(len(tr))
            for itr, ite in StratifiedGroupKFold(5, shuffle=True, random_state=seed + 1).split(X[tr], strat[tr], grp[tr]):
                inner[ite] = make(kind, C).fit(X[tr][itr], y[tr][itr]).predict_proba(X[tr][ite])[:, 1]
            thr_used[te] = thr_for_sens(y[tr], inner)
    return oof, thr_used

def summarise(y, p, thr, groups):
    pred = (p >= thr).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum()); fn = int(((pred == 0) & (y == 1)).sum())
    tn = int(((pred == 0) & (y == 0)).sum()); fp = int(((pred == 1) & (y == 0)).sum())
    auc = roc_auc_score(y, p) if len(np.unique(y)) == 2 else float('nan')
    ci = boot_auc(y, p, groups) if len(np.unique(y)) == 2 else (float('nan'),) * 2
    se = wilson(tp, tp + fn); sp = wilson(tn, tn + fp)
    return dict(n=int(len(y)), n_pos=int(y.sum()), auc=round(auc, 3), auc_ci95=[round(ci[0], 3), round(ci[1], 3)],
                sensitivity=round(se[0], 3), sens_ci95=[round(se[1], 3), round(se[2], 3)],
                specificity=round(sp[0], 3), spec_ci95=[round(sp[1], 3), round(sp[2], 3)],
                tp=tp, fn=fn, tn=tn, fp=fp)

results = {'ghana_dedup': ghana_info, 'n_total': int(len(y)), 'per_dataset_counts':
           data.groupby('dataset').label.agg(['size', 'sum']).rename(columns={'size': 'n', 'sum': 'anaemic'}).to_dict('index')}

# ---------------- choose C for LR by repeated CV AUC ----------------
cgrid = [0.01, 0.1, 1.0, 10.0]
cv_auc = {}
for C in cgrid:
    a = [roc_auc_score(y, cv_oof('lr', X, y, grp, strat, C, seed=s, nested_thr=False)[0]) for s in range(10)]
    cv_auc[C] = (float(np.mean(a)), float(np.std(a)))
results['lr_C_grid_auc_mean_sd_10x5fold'] = {str(k): [round(v[0], 3), round(v[1], 3)] for k, v in cv_auc.items()}
bestC = max(cgrid, key=lambda c: cv_auc[c][0])
results['lr_C'] = bestC
gb_auc = [roc_auc_score(y, cv_oof('gbm', X, y, grp, strat, seed=s, nested_thr=False)[0]) for s in range(5)]
results['gbm_auc_mean_sd_5x5fold'] = [round(float(np.mean(gb_auc)), 3), round(float(np.std(gb_auc)), 3)]

# ---------------- main pooled evaluation (seed 42), nested threshold ----------------
pooled = {}
for kind in ['lr', 'gbm', 'blend']:
    oof, thr_used = cv_oof(kind, X, y, grp, strat, bestC, seed=42)
    pred_thr = thr_used
    res = {'all': summarise(y, oof, pred_thr, grp)}
    for dname in ['ghana', 'eda_india', 'eda_italy']:
        mk = ds == dname
        res[dname] = summarise(y[mk], oof[mk], pred_thr[mk], grp[mk])
    mk = ds != 'ghana'
    res['eda_all'] = summarise(y[mk], oof[mk], pred_thr[mk], grp[mk])
    # Hb correlation (Eyes-defy only)
    if kind == 'lr':
        hb = data.hb.values; mk2 = ~np.isnan(hb)
        res['spearman_prob_vs_hb_eda'] = round(float(pd.Series(oof[mk2]).corr(pd.Series(hb[mk2]), method='spearman')), 3)
        data['oof_lr'] = oof
    pooled[kind] = res
results['pooled_cv'] = pooled

# ---------------- within-dataset and cross-dataset ----------------
within, cross = {}, {}
for dname, mk in [('ghana', ds == 'ghana'), ('eda_all', ds != 'ghana'), ('eda_india', ds == 'eda_india')]:
    oof, tu = cv_oof('lr', X[mk], y[mk], grp[mk], strat[mk], bestC, seed=42)
    within[dname] = summarise(y[mk], oof, tu, grp[mk])
for kind in ['lr', 'gbm', 'blend']:
    for a, b in [('ghana', 'eda'), ('eda', 'ghana')]:
        tr = (ds == 'ghana') if a == 'ghana' else (ds != 'ghana'); te = ~tr
        m = make(kind, bestC).fit(X[tr], y[tr])
        inner, _ = cv_oof(kind, X[tr], y[tr], grp[tr], strat[tr], bestC, seed=7, nested_thr=False)
        t = thr_for_sens(y[tr], inner)
        cross[f'{kind}_train_{a}_test_{b}'] = summarise(y[te], m.predict_proba(X[te])[:, 1], t, grp[te])
results['within_dataset_lr'] = within
results['cross_dataset_lr'] = cross

# ---------------- final model ----------------
oof_final, _ = cv_oof('blend', X, y, grp, strat, bestC, seed=42, nested_thr=False)
thr = thr_for_sens(y, oof_final)
final = make('blend', bestC).fit(X, y)
sc, lr = final.lr.named_steps['standardscaler'], final.lr.named_steps['logisticregression']
results['final_threshold_from_oof'] = thr
results['final_oof_at_threshold'] = summarise(y, oof_final, np.full(len(y), thr), grp)

def export_tree(pred):
    """Compact parallel arrays; f = -1 marks a leaf. Go left when x[f] <= t (NaN follows m)."""
    n = pred.nodes
    return {'f': [int(-1 if leaf else fi) for fi, leaf in zip(n['feature_idx'], n['is_leaf'])],
            't': [float(v) for v in n['num_threshold']], 'l': [int(v) for v in n['left']], 'r': [int(v) for v in n['right']],
            'm': [int(v) for v in n['missing_go_to_left']], 'v': [float(v) for v in n['value']]}

model = {
    'name': 'niktan-anaemia-conjunctiva-blend',
    'version': '2.0.0',
    'kind': 'blend',
    'task': 'P(anaemia) from palpebral conjunctiva colour',
    'featureSpec': 'features.py (wb=none, HIGHLIGHT_MAX=250, SHADOW_MIN=20, MIN_PIXELS=50, sRGB D65 CIELAB)',
    'whiteBalance': 'none',
    'features': F.FEATURE_NAMES,
    'standardization': {'mean': sc.mean_.tolist(), 'std': sc.scale_.tolist()},
    'coefficients': lr.coef_[0].tolist(),
    'intercept': float(lr.intercept_[0]),
    'gbmWeight': GBM_WEIGHT,
    'baseline': float(np.ravel(final.gbm._baseline_prediction)[0]),
    'trees': [export_tree(p[0]) for p in final.gbm._predictors],
    'link': 'p = 1/(1+exp(-z)), z = gbmWeight*(baseline + sum of tree leaf values) + (1-gbmWeight)*(sum_i coef_i*(x_i-mean_i)/std_i + intercept)',
    'threshold': thr,
    'thresholdRule': f'largest p with out-of-fold sensitivity >= {TARGET_SENS} (pooled training data)',
    'hyperparameters': {'max_depth': 2, 'max_iter': 200, 'learning_rate': 0.05, 'min_samples_leaf': 40, 'l2_regularization': 1.0},
    'labels': 'Ghana children 6-59 mo: dataset label (lab Hb, WHO <11 g/dL); Eyes-defy-anemia adults: WHO Hb <12 (F) / <13 (M) g/dL',
    'training': {'n': int(len(y)), 'n_anaemic': int(y.sum()), 'datasets': results['per_dataset_counts']},
    'metrics': {
        'cv': 'patient-grouped stratified 5-fold, threshold re-chosen inside each training fold (nested)',
        'pooled': pooled['blend']['all'], 'ghana': pooled['blend']['ghana'], 'eda_india': pooled['blend']['eda_india'],
        'eda_italy': pooled['blend']['eda_italy'], 'lr_pooled': pooled['lr']['all'], 'gbm_pooled': pooled['gbm']['all'], 'cross_dataset': cross,
    },
    'intendedUse': 'Screening prompt only ("possible anaemia - get a Hb blood test"); not diagnostic.',
}
json.dump(model, open(OUT + '/anemiaModel.json', 'w'))
json.dump(results, open(OUT + '/metrics.json', 'w'), indent=2, default=str)
# sanity: our manual predict == sklearn
p_manual = np.array([F.predict_proba(x, model) for x in X[:50]])
assert np.allclose(p_manual, final.predict_proba(X[:50])[:, 1], atol=1e-9)
print(json.dumps(results, indent=1, default=str))
