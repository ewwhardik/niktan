import sys, os, re, glob, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd
import features as F

# Folder holding the downloaded datasets (never committed); see ml/anemia/README.md.
DATA = os.environ.get('NIKTAN_ANEMIA_DATA', os.path.expanduser('~/niktan-datasets/anemia'))

rows = []
G = glob.glob(os.path.join(DATA, 'ghana_ida_nt7r8hv2pz/extracted/*/*.png'))
for p in sorted(G):
    fn = os.path.basename(p)
    rgb, m = F.load_rgba_png(p)
    px = F.select_pixels(rgb, m)
    # rotation/flip invariant content key: sorted colour multiset hash
    key = hashlib.md5(np.sort(px[:,0]*65536+px[:,1]*256+px[:,2]).tobytes()).hexdigest()
    try: f = F.features_from_pixels(px)
    except ValueError as e: print('skip', fn, e); continue
    lab = 0 if fn.lower().startswith('non') else 1
    aug = bool(re.search(r' \(\d+\)', fn)) or 'Copy' in fn
    rows.append(dict(dataset='ghana', file=fn, label=lab, hb=np.nan, sex='', age=np.nan, aug=aug, ckey=key, npx=len(px), **f))

E = os.path.join(DATA, 'eyes_defy_anemia_github_mirror')
for country in ['India', 'Italy']:
    meta = pd.read_excel(f'{E}/{country}/{country}.xlsx')
    for _, r in meta.iterrows():
        n = int(r['Number']); d = f'{E}/{country}/{n}'
        cands = [x for x in sorted(os.listdir(d), key=lambda s:(len(s),s)) if re.search(r'pa[lp]+l?ebral', x) and 'forniceal' not in x] if os.path.isdir(d) else []
        if not cands: print('no palpebral', country, n); continue
        p = os.path.join(d, cands[0])
        rgb, m = F.load_rgba_png(p)
        px = F.select_pixels(rgb, m)
        try:
            hb = float(str(r['Hgb']).replace(',', '.'))
        except ValueError:
            hb = np.nan
        notes = ' '.join(str(r[c]) for c in meta.columns if c not in ('Number','Hgb','Gender','Age') and str(r[c]) != 'nan')
        f = F.features_from_pixels(px)
        rows.append(dict(dataset='eda_'+country.lower(), file=f'{country}/{n}/{cands[0]}', label=np.nan, hb=hb, sex=str(r['Gender']).strip().upper(), age=r['Age'], aug=False, ckey='', npx=len(px), note=notes, **f))
df = pd.DataFrame(rows)
df.to_csv(sys.argv[1], index=False)
print(df.groupby('dataset').size())
