import glob, re, sys, unicodedata
import pandas as pd
sys.path.insert(0,'pipeline')
from party_lr import PARTY_LR, CONSTITUENT_PATTERNS
def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD",str(s)) if not unicodedata.combining(c))
def norm(s): return re.sub(r"\s+"," ",strip_accents(str(s)).upper().strip())
compiled=[(re.compile("^"+re.escape(n)+"$"),sc) for n,sc,_,_ in PARTY_LR]
constituents=[(re.compile(p),sc) for p,sc in CONSTITUENT_PATTERNS]
direct={n:s for n,s,_,_ in PARTY_LR}
# full-table "true" constituent matcher: match ANY direct row name fragment present in coalition string
direct_frag=[(re.compile(re.escape(n)),s) for n,s,_,_ in PARTY_LR if not n.startswith("COALICION") and not n.startswith("CENTRO ESP") and not n.startswith("EQUIPO POR") and not n.startswith("PACTO") and not n.startswith("ALTERNATIVOS") and not n.startswith("COALICIONES")]
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

affected_votes=0; total_coal_votes=0; n_aff=0
examples=[]
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
        if any(rx.search(pty) for rx,_ in compiled): continue  # has direct row
        total_coal_votes+=v
        used_hits=[sc for rx,sc in constituents if rx.search(pty)]
        full_hits=[s for rx,s in direct_frag if rx.search(pty)]
        if not used_hits: continue
        used=round(sum(used_hits)/len(used_hits),2)
        if full_hits and len(full_hits)!=len(used_hits):
            full=round(sum(full_hits)/len(full_hits),2)
            if abs(full-used)>1e-9:
                affected_votes+=v; n_aff+=1
                if len(examples)<12:
                    examples.append((pty[:62],used,full,int(v)))
print(f"derived-coalition votes (no direct row): {total_coal_votes:,.0f}")
print(f"coalitions where subset-mean != full-table-mean: {n_aff}, votes affected {affected_votes:,.0f}")
print(f"share of derived-coalition votes mis-scored: {100*affected_votes/total_coal_votes:.1f}%")
print("\nExamples (used_score -> full_table_score, votes):")
for p,u,f,v in examples:
    print(f"  {u:+.2f} -> {f:+.2f}  ({v:>8,})  {p}")
