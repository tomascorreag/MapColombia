"""Build a victim-band candidate packet for the annotation pipeline.

  python pipeline/gen_band.py LO HI [--out PATH]

Emits events with LO <= Total_Victimas_Caso < HI, using build_frontend_data's
keep-filter (via match_event.load_modality), EXCLUDING any IdCaso already present
in annotation_seeds.json or annotation_dropped.json, ranked by victim count desc.
Modality display names are read from the shipped violence_meta.json (authoritative).

Prints the remaining-event count to stdout (so a driver can detect tier exhaustion)
and writes the packet JSON to --out (default pipeline/annotation_band.json)."""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import match_event as me  # noqa: E402


def mod_names() -> dict:
    meta = json.loads((ROOT / "data" / "processed" / "frontend" / "violence_meta.json").read_text(encoding="utf-8"))
    return {m["code"]: (m.get("name_es") or m.get("name") or m["code"]) for m in meta["modalities"]}


def processed_idcasos() -> set:
    seen = set()
    for fn in ("annotation_seeds.json", "annotation_dropped.json"):
        p = ROOT / "pipeline" / fn
        if p.exists():
            for x in json.loads(p.read_text(encoding="utf-8")):
                if x.get("idCaso") is not None:
                    seen.add(int(x["idCaso"]))
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lo", type=int)
    ap.add_argument("hi", type=int)
    ap.add_argument("--out", default=str(ROOT / "pipeline" / "annotation_band.json"))
    args = ap.parse_args()

    names = mod_names()
    seen = processed_idcasos()
    rows, ids = [], set()
    for mod in me.manifest_files():
        df = me.load_modality(mod)
        df = df[df._kept]
        vic = pd.to_numeric(df.Total_Victimas_Caso, errors="coerce").fillna(0).astype(int)
        band = df[(vic >= args.lo) & (vic < args.hi)]
        for _, r in band.iterrows():
            idc = int(r.IdCaso)
            if idc in seen or idc in ids:
                continue
            ids.add(idc)
            rows.append({
                "idCaso": idc,
                "modality": mod,
                "modalityName": names.get(mod, mod),
                "municipioDane": int(r._muni),
                "municipio": str(r.Nombre_Municipio),
                "departamento": str(r.Nombre_Departamento),
                "date": me.coded_iso(r),
                "codedVictims": int(pd.to_numeric(r.Total_Victimas_Caso, errors="coerce") or 0),
                "codedResponsible": f"{r.Presunto_Responsable} / {r.Descripcion_Presunto_Responsabl}",
            })

    rows.sort(key=lambda x: -x["codedVictims"])
    Path(args.out).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    hist = Counter(x["modality"] for x in rows)
    print(f"REMAINING {len(rows)}")
    print(f"band [{args.lo},{args.hi}) unprocessed: {len(rows)} | mix {dict(hist.most_common())} -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
