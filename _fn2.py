import pandas as pd, re, sys, unicodedata
sys.path.insert(0,'pipeline')
def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c))
def norm(s): return re.sub(r"\s+"," ",strip_accents(str(s)).upper().strip())
from pandas.io.stata import StataReader
with StataReader("data/raw/cede/electoral/Partidos_Electorales.dta") as r:
    vl=r.value_labels()
labels={int(k):norm(v) for k,v in max(vl.values(),key=len).items()} if vl else {}
for yr in (1958,1970,1974):
    p=f"data/raw/cede/electoral/{yr}_presidencia.tab"
    df=pd.read_csv(p,sep="\t",low_memory=False,usecols=["codmpio","codigo_partido","votos","circunscripcion"])
    df["votos"]=pd.to_numeric(df.votos,errors="coerce").fillna(0)
    ct=df.groupby("circunscripcion",dropna=False).votos.sum()
    main=ct.idxmax(); dd=df[df.circunscripcion==main]
    sub=dd[dd.codigo_partido.notna()].copy()
    if pd.api.types.is_numeric_dtype(sub.codigo_partido):
        sub["party"]=[labels.get(int(c),f"CODIGO {c}") for c in sub.codigo_partido.astype(int)]
    else: sub["party"]=sub.codigo_partido.map(norm)
    agg=sub.groupby("party").votos.sum().sort_values(ascending=False)
    tot=dd.votos.sum()
    print(f"=== {yr} presidencia (circ {main!r}) ===")
    for pty,v in agg.head(5).items(): print(f"   {pty[:45]:45s} {100*v/tot:5.1f}%")
    nullv=dd[dd.codigo_partido.isna()].votos.sum()
    print(f"   [null rows] {100*nullv/tot:.1f}%\n")
