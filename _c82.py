import pandas as pd, re, sys, unicodedata
def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c))
def norm(s): return re.sub(r"\s+"," ",strip_accents(str(s)).upper().strip())
from pandas.io.stata import StataReader
with StataReader("data/raw/cede/electoral/Partidos_Electorales.dta") as r:
    vl=r.value_labels()
labels={int(k):norm(v) for k,v in max(vl.values(),key=len).items()} if vl else {}
p="data/raw/cede/electoral/1982_presidencia.tab"
df=pd.read_csv(p,sep="\t",low_memory=False,usecols=["codmpio","codigo_partido","votos","circunscripcion"])
df["votos"]=pd.to_numeric(df.votos,errors="coerce").fillna(0)
ct=df.groupby("circunscripcion",dropna=False).votos.sum()
dd=df[df.circunscripcion==ct.idxmax()]
sub=dd[dd.codigo_partido.notna()].copy()
if pd.api.types.is_numeric_dtype(sub.codigo_partido):
    sub["party"]=[labels.get(int(c),f"CODIGO {c}") for c in sub.codigo_partido.astype(int)]
else: sub["party"]=sub.codigo_partido.map(norm)
agg=sub.groupby("party").votos.sum().sort_values(ascending=False)
tot=dd.votos.sum()
print(f"1982 presidencia principal circ total {tot:,.0f}")
for pty,v in agg.items():
    print(f"  {100*v/tot:5.1f}%  {v:>10,.0f}  {pty}")
