import glob, re, sys, unicodedata
import pandas as pd
sys.path.insert(0,'pipeline')
from party_lr import PARTY_LR, CONSTITUENT_PATTERNS
def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD",str(s)) if not unicodedata.combining(c))
def norm(s): return re.sub(r"\s+"," ",strip_accents(str(s)).upper().strip())
compiled=[(re.compile("^"+re.escape(n)+"$"),sc) for n,sc,_,_ in PARTY_LR]
constituents=[(re.compile(p),sc) for p,sc in CONSTITUENT_PATTERNS]
cache={}
def party_score(name):
    if name in cache: return cache[name]
    s=None
    for rx,sc in compiled:
        if rx.search(name): s=sc;break
    if s is None and "COALICION" in name:
        hits=[sc for rx,sc in constituents if rx.search(name)]
        if hits: s=round(sum(hits)/len(hits),2)
    cache[name]=s;return s

from pandas.io.stata import StataReader
with StataReader("data/raw/cede/electoral/Partidos_Electorales.dta") as r:
    vl=r.value_labels()
labels={int(k):norm(v) for k,v in max(vl.values(),key=len).items()} if vl else {}

# Collect all coalition-derived scores actually used, and check off-5pt-scale values
SCALE={-1,-0.5,0,0.5,1}
coal_scores={}
files=sorted(glob.glob("data/raw/cede/electoral/*.tab"))
for path in files:
    fn=path.replace("\\","/").split("/")[-1]
    m=re.match(r"(\d{4})_(camara|senado|presidencia)",fn)
    if not m: continue
    df=pd.read_csv(path,sep="\t",low_memory=False,usecols=["codigo_partido","votos","circunscripcion"])
    df["votos"]=pd.to_numeric(df.votos,errors="coerce").fillna(0)
    ct=df.groupby("circunscripcion",dropna=False).votos.sum()
    df=df[df.circunscripcion==ct.idxmax()]
    df=df[df.codigo_partido.notna()]
    if pd.api.types.is_numeric_dtype(df.codigo_partido):
        parties=[labels.get(int(c),f"CODIGO {c}") for c in df.codigo_partido.astype(int)]
    else:
        parties=[norm(c) for c in df.codigo_partido]
    for p in set(parties):
        sc=party_score(p)
        if sc is not None and "COALICION" in p and not any(re.compile("^"+re.escape(n)+"$").search(p) for n,_,_,_ in PARTY_LR):
            coal_scores[p]=sc
print("Coalition-DERIVED (constituent-mean) scores actually in data:")
offscale=[]
for p,sc in sorted(coal_scores.items()):
    tag=" <== OFF 5-PT SCALE" if sc not in SCALE else ""
    if tag: offscale.append((p,sc))
    print(f"   {sc:+.2f}  {p[:70]}{tag}")
print("\nOFF-SCALE coalition scores:",len(offscale))
for p,sc in offscale: print("   ",sc,p)
