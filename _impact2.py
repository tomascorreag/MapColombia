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
def score_used(name):
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

# Direct-scored parties with NO constituent pattern, by their short signature substrings likely appearing in coalition strings
no_pat_signatures = {
 "UNION CRISTIANA": 1, "MOVIMIENTO NACIONAL": 0.5, "VIA ALTERNA": -1, "COLOMBIA SIEMPRE": 1,
 "FUERZA PROGRESISTA": 1, "ALAS EQUIPO COLOMBIA":0.5, "CONVERGENCIA CIUDADANA":0.5,
 "SOMOS COLOMBIA":0.5, "COLOMBIA DEMOCRATICA":1, "OPCION CIUDADANA":1, "MOIR":-1,
 "PARTIDO POPULAR":1,  # PARTIDO POPULAR not scored actually; skip via check
}
# verify which of these are truly in direct table
direct={n:s for n,s,_,_ in PARTY_LR}

flagged=[]
files=sorted(glob.glob("data/raw/cede/electoral/*.tab"))
for path in files:
    fn=path.replace("\\","/").split("/")[-1]
    if not re.match(r"\d{4}_(camara|senado)",fn): continue
    df=pd.read_csv(path,sep="\t",low_memory=False,usecols=["codigo_partido","votos","circunscripcion"])
    df["votos"]=pd.to_numeric(df.votos,errors="coerce").fillna(0)
    ct=df.groupby("circunscripcion",dropna=False).votos.sum()
    df=df[df.circunscripcion==ct.idxmax()]
    df=df[df.codigo_partido.notna()]
    if pd.api.types.is_numeric_dtype(df.codigo_partido):
        df=df.assign(party=[labels.get(int(c),f"CODIGO {c}") for c in df.codigo_partido.astype(int)])
    else:
        df=df.assign(party=df.codigo_partido.map(norm))
    g=df.groupby("party").votos.sum()
    for pty,v in g.items():
        if not pty.startswith("COALICION"): continue
        if any(rx.search(pty) for rx,_ in compiled): continue
        used=score_used(pty)
        if used is None: continue
        # does the coalition string contain a no-pattern direct party signature?
        for sig,_ in [(s,0) for s in no_pat_signatures]:
            if sig in pty:
                # confirm that signature is NOT one of the constituent patterns that fired
                fired=[p for p,_ in CONSTITUENT_PATTERNS if re.search(p,pty)]
                flagged.append((pty[:70],used,sig,int(v)))
                break

# dedup by coalition name keeping max votes
agg={}
for pty,used,sig,v in flagged:
    agg[(pty,used,sig)]=agg.get((pty,used,sig),0)+v
print("Derived coalitions containing a directly-scored party that has NO constituent pattern (member silently dropped):")
tot=0
for (pty,used,sig),v in sorted(agg.items(),key=lambda x:-x[1]):
    tot+=v
    print(f"  used={used:+.2f}  dropped~{sig!r:24s} votes={v:>8,}  {pty}")
print(f"\nTotal votes in such coalitions: {tot:,}")
