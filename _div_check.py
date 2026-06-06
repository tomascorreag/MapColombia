import sys, re
sys.path.insert(0,'pipeline')
from party_lr import PARTY_LR, CONSTITUENT_PATTERNS

print("PARTY_LR rows:", len(PARTY_LR))
print("Distinct scores in PARTY_LR:", sorted(set(s for _,s,_,_ in PARTY_LR)))

# Build name->direct score
direct = {n: s for n,s,_,_ in PARTY_LR}

# For each constituent pattern, find the direct rows it would match, check score agreement
print("\n--- Constituent pattern vs direct-row score divergence ---")
for pat, csc in CONSTITUENT_PATTERNS:
    rx = re.compile(pat)
    matched = [(n, direct[n]) for n in direct if rx.search(n)]
    diverge = [(n,s) for n,s in matched if s != csc]
    if diverge:
        for n,s in diverge:
            print(f"  pat {pat!r} (csc={csc}) matches direct row {n[:55]!r} score={s}  <-- DIVERGES")

# Which direct-table parties have NO constituent pattern (so they vanish from coalition means)?
print("\n--- Direct-table parties NOT covered by any constituent pattern (would be dropped from a coalition mean) ---")
pats=[re.compile(p) for p,_ in CONSTITUENT_PATTERNS]
missing=[]
for n,s,_,_ in PARTY_LR:
    if n.startswith("COALICION") or n.startswith("CENTRO ESPERANZA") or n.startswith("EQUIPO POR") or n.startswith("PACTO HISTORICO") or n.startswith("ALTERNATIVOS") or n.startswith("COALICIONES"):
        continue
    if not any(rx.search(n) for rx in pats):
        missing.append((n,s))
for n,s in missing:
    print(f"  {s:+.1f}  {n[:70]}")
print("count missing:", len(missing))
