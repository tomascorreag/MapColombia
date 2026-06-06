import glob, re, sys, unicodedata
import pandas as pd
sys.path.insert(0, 'pipeline')
from party_lr import PARTY_LR, CONSTITUENT_PATTERNS

def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c))
def norm_party(s):
    return re.sub(r"\s+", " ", strip_accents(str(s)).upper().strip())

compiled = [(re.compile("^" + re.escape(n) + "$"), sc) for n, sc, _, _ in PARTY_LR]
constituents = [(re.compile(p), sc) for p, sc in CONSTITUENT_PATTERNS]
cache = {}
def party_score(name):
    if name in cache: return cache[name]
    s = None
    for rx, sc in compiled:
        if rx.search(name): s = sc; break
    if s is None and "COALICION" in name:
        hits = [sc for rx, sc in constituents if rx.search(name)]
        if hits: s = round(sum(hits) / len(hits), 2)
    cache[name] = s
    return s

def load_party_labels():
    from pandas.io.stata import StataReader
    path = "data/raw/cede/electoral/Partidos_Electorales.dta"
    try:
        with StataReader(path) as r:
            vl = r.value_labels()
        if vl:
            best = max(vl.values(), key=len)
            return {int(k): norm_party(v) for k, v in best.items()}
    except Exception as e:
        print("label err", e)
    return {}

code_labels = load_party_labels()
print("n labels", len(code_labels))

results = []
files = sorted(glob.glob("data/raw/cede/electoral/*.tab"))
for path in files:
    fn = path.replace("\\", "/").split("/")[-1]
    m = re.match(r"(\d{4})_(camara|senado|presidencia)(_primera_vuelta|_segunda_vuelta)?\.tab", fn)
    if not m: continue
    year = int(m.group(1)); body = m.group(2); rsfx = m.group(3)
    df = pd.read_csv(path, sep="\t", low_memory=False, usecols=["codmpio","codigo_partido","votos","circunscripcion"])
    df["votos"] = pd.to_numeric(df.votos, errors="coerce").fillna(0)
    df = df.dropna(subset=["codmpio"])
    ct = df.groupby("circunscripcion", dropna=False).votos.sum()
    df = df[df.circunscripcion == ct.idxmax()]
    df = df[df.codigo_partido.notna()].copy()
    if pd.api.types.is_numeric_dtype(df.codigo_partido):
        codes = df.codigo_partido.astype(int)
        df["party"] = [code_labels.get(c, f"CODIGO {c}") for c in codes]
    else:
        df["party"] = df.codigo_partido.map(norm_party)
    df["score"] = df.party.map(party_score)
    tot = df.votos.sum()
    scored = df[df.score.notna()].votos.sum()
    cov = 100*scored/tot if tot else 0
    results.append((cov, body, year, rsfx, scored, tot))

results.sort()
print("\n--- WORST 12 national party-attributed coverage ---")
for cov, body, year, rsfx, scored, tot in results[:12]:
    print(f"{body:11s} {year} {rsfx or '':16s} cov={cov:5.1f}%  scored {scored:,.0f}/{tot:,.0f}")
print("\nMIN over all elections:", f"{results[0][0]:.1f}%", results[0][1], results[0][2])
below83 = [r for r in results if r[0] < 83]
print("Elections below 83%:", [(r[1], r[2], round(r[0],1)) for r in below83])
below94 = [r for r in results if r[0] < 94]
print("Elections below 94%:", [(r[1], r[2], round(r[0],1)) for r in below94])
