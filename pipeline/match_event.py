"""Annotation candidate matcher — the deterministic half of the "Read more…"
curation pipeline (see docs/annotation-curation.md).

A plain script cannot web-search; the *search* step is agent work that produces a
seeds file (pipeline/annotation_seeds.json) of well-sourced events with their
facts. THIS script enforces the hard gate on each seed:

  An event qualifies iff its facts resolve to EXACTLY ONE CNMH IdCaso that the
  shipped binary actually contains.

It reads the same raw geoportal cut the binary is built from (via
data/raw/cnmh/manifest.json) and replicates build_frontend_data.py's keep-filter,
so a matched IdCaso is guaranteed present in violence.bin. It records every seed's
outcome (matched / ambiguous / no_match / matched_but_excluded), detects conflicts
between the sources' figures and the CNMH-coded values, and proposes a merge mode.
Nothing is written to annotations.json until `promote` is run on a chosen key.

Subcommands:
  resolve "<municipio name>" [--dept "<dept>"]   -> DANE code(s), to author a seed
  match   [--seeds F] [--out F]                  -> run the gate, write candidates
  promote --key <slug> [--reviewer NAME]         -> candidate -> annotations.json
  validate                                       -> re-check annotations.json entries

Usage: python pipeline/match_event.py <subcommand> [...]
"""

import argparse
import json
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed" / "frontend"

SEEDS = ROOT / "pipeline" / "annotation_seeds.json"
CANDIDATES = ROOT / "pipeline" / "annotation_candidates.json"  # staging, not served
ANNOTATIONS = OUT / "annotations.json"  # the served artifact (loaded by the app)

# --- must match build_frontend_data.py exactly (so matched == shipped) ---------
YEAR_MIN, YEAR_MAX = 1958, 2026
LAT_RANGE = (-4.5, 14.0)
LON_RANGE = (-82.5, -66.5)

MIN_SOURCES_AUTO = 3  # auto-merge floor (see docs/event-annotations.md)


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c)
    ).upper().strip()


def manifest_files() -> dict:
    """modality code -> absolute Path of its geoportal casos CSV."""
    m = json.loads((RAW / "cnmh" / "manifest.json").read_text(encoding="utf-8"))
    return {
        d["modality"]: ROOT / d["file"]
        for d in m["datasets"]
        if d.get("family") == "geoportal" and d.get("kind") == "casos"
    }


_CSV_CACHE: dict = {}


def load_modality(mod: str) -> pd.DataFrame:
    """Raw casos CSV for a modality, with the build's keep-mask computed as
    `_kept` (True = the row is in violence.bin)."""
    if mod in _CSV_CACHE:
        return _CSV_CACHE[mod]
    files = manifest_files()
    if mod not in files:
        raise SystemExit(f"unknown modality {mod!r}; known: {sorted(files)}")
    df = pd.read_csv(files[mod], low_memory=False)
    yr = pd.to_numeric(df.Anio_hecho, errors="coerce").fillna(0).astype(int)
    lat = pd.to_numeric(df.Latitud, errors="coerce")
    lon = pd.to_numeric(df.Longitud, errors="coerce")
    mcode = pd.to_numeric(df.Geo_municipio, errors="coerce").fillna(0).astype(int)
    ok_coord = lat.between(*LAT_RANGE) & lon.between(*LON_RANGE)
    placeholder = mcode % 1000 == 0  # XX000 = municipality unknown (dept centroid)
    in_window = (yr >= YEAR_MIN) & (yr <= YEAR_MAX)
    df = df.assign(
        _year=yr,
        _muni=mcode,
        _mes=pd.to_numeric(df.mes_hecho, errors="coerce").fillna(0).astype(int),
        _dia=pd.to_numeric(df.dia_hecho, errors="coerce").fillna(0).astype(int),
        _kept=in_window & ok_coord & ~placeholder,
    )
    _CSV_CACHE[mod] = df
    return df


def coded_iso(row) -> str:
    y, m, d = int(row._year), int(row._mes), int(row._dia)
    if m and d:
        return f"{y:04d}-{m:02d}-{d:02d}"
    if m:
        return f"{y:04d}-{m:02d}"
    return f"{y:04d}"


def parse_date(s: str):
    p = str(s).split("-")
    y = int(p[0])
    m = int(p[1]) if len(p) > 1 else None
    d = int(p[2]) if len(p) > 2 else None
    return y, m, d


# --- resolve municipio name -> DANE -------------------------------------------
def resolve_muni(name: str, dept: str | None = None):
    munis = json.loads((OUT / "munis.json").read_text(encoding="utf-8"))
    q = strip_accents(name)
    qd = strip_accents(dept) if dept else None
    hits = []
    for code, nm, dp in zip(munis["codes"], munis["names"], munis["depts"]):
        if q in strip_accents(nm) and (qd is None or qd in strip_accents(dp)):
            hits.append((code, nm, dp))
    return hits


# --- the gate -----------------------------------------------------------------
def match_seed(seed: dict) -> dict:
    """Resolve one seed against the raw cut. Returns a candidate record."""
    mod = seed["modality"]
    dane = int(seed["municipioDane"])
    y, mo, da = parse_date(seed["date"])
    df = load_modality(mod)

    conflicts: list[dict] = []
    disambiguated_by: list[str] = []

    # data-first: the seed already knows its IdCaso (from the shipped binary).
    # Pin to that row directly — no resolution, so no ambiguity. The seed's other
    # fields are used only for the consistency checks below.
    if seed.get("idCaso") is not None:
        pinned = df[(df.IdCaso == seed["idCaso"]) & df._kept]
        if len(pinned) == 0:
            return {
                "key": seed["key"], "status": "no_match",
                "note": f"seed idCaso {seed['idCaso']} not among shipped {mod} rows",
                "mergeSuggestion": "reject", "candidatesInMuniYear": 0,
                "disambiguatedBy": [],
            }
        cands = pinned
        n_year = len(df[(df._muni == dane) & (df._year == y) & df._kept])
        disambiguated_by = ["idCaso"]
        return _finish_match(seed, cands, n_year, conflicts, disambiguated_by)

    in_muni = df[df._muni == dane]
    pool_all = in_muni[in_muni._year == y]            # municipio+year, incl. excluded
    pool = pool_all[pool_all._kept]                   # only rows the binary ships
    n_year = len(pool)
    cands = pool

    def narrow(mask, label):
        nonlocal cands
        if len(cands) <= 1:
            return
        sub = cands[mask(cands)]
        if len(sub) == 0:
            conflicts.append({"field": label, "note": "no row matched this key"})
        elif len(sub) < len(cands):
            cands = sub
            disambiguated_by.append(label)

    if mo:
        narrow(lambda c: c._mes == mo, "month")
    if da:
        narrow(lambda c: c._dia == da, "day")
    if seed.get("victims") is not None:
        narrow(lambda c: c.Total_Victimas_Caso == seed["victims"], "victimCount")
    if seed.get("responsibleHint"):
        hint = strip_accents(seed["responsibleHint"])
        narrow(
            lambda c: c.Presunto_Responsable.fillna("").map(strip_accents).str.contains(hint),
            "responsible",
        )

    return _finish_match(seed, cands, n_year, conflicts, disambiguated_by)


def _finish_match(seed, cands, n_year, conflicts, disambiguated_by) -> dict:
    """Shared tail for both the pinned (data-first) and resolved paths: classify
    the candidate set and, for a single match, run the consistency checks."""
    rec: dict = {
        "key": seed["key"],
        "seed": {k: seed[k] for k in ("modality", "municipioDane", "date", "victims",
                                      "responsibleHint") if k in seed},
        "candidatesInMuniYear": n_year,
        "disambiguatedBy": disambiguated_by,
    }

    if len(cands) == 0:
        rec["status"] = "no_match"
        rec["note"] = ("no kept row for this seed; the event may be coded under "
                       "another modality/municipio/year, or excluded by the build")
        rec["mergeSuggestion"] = "reject"
        return rec

    if len(cands) > 1:
        rec["status"] = "ambiguous"
        rec["candidateIdCasos"] = [int(x) for x in cands.IdCaso.tolist()][:20]
        rec["mergeSuggestion"] = "reject"
        rec["note"] = (f"{len(cands)} rows survive the seed's keys; supply a sharper "
                       "date / victim count / perpetrator to disambiguate")
        return rec

    # exactly one
    row = cands.iloc[0]
    coded_victims = int(pd.to_numeric(row.Total_Victimas_Caso, errors="coerce") or 0)
    rec["status"] = "matched"
    rec["idCaso"] = int(row.IdCaso)
    rec["coded"] = {
        "date": coded_iso(row),
        "victims": coded_victims,
        "responsible": str(row.Presunto_Responsable),
        "responsibleGroup": str(row.Descripcion_Presunto_Responsabl),
        "municipio": str(row.Nombre_Municipio),
        "departamento": str(row.Nombre_Departamento),
    }

    # Consistency checks on the matched row — run unconditionally (a key used to
    # *disambiguate* exits narrow() early when one row remains, so it would never
    # be checked otherwise). Any conflict blocks auto-merge.
    #
    # 1. sources' figure vs the CNMH-coded count
    if seed.get("victims") is not None and seed["victims"] != coded_victims:
        conflicts.append({
            "field": "victims",
            "seed": seed["victims"],
            "coded": coded_victims,
            "note": "source figure differs from CNMH-coded count; report coded value",
        })
    # 2. stated perpetrator vs the coded perpetrator (category or specific group)
    if seed.get("responsibleHint"):
        rh = strip_accents(seed["responsibleHint"])
        coded_resp = (strip_accents(row.Presunto_Responsable) + " "
                      + strip_accents(row.Descripcion_Presunto_Responsabl))
        if rh not in coded_resp:
            conflicts.append({
                "field": "responsible",
                "seed": seed["responsibleHint"],
                "coded": str(row.Presunto_Responsable),
                "note": "coded perpetrator differs from the stated perpetrator",
            })
    # 3. editorial flag: figures disputed across sources (not machine-detectable)
    if seed.get("disputedFigures"):
        conflicts.append({
            "field": "victims",
            "note": seed.get("disputeNote", "victim figures disputed across sources"),
        })
    rec["conflicts"] = conflicts

    n_sources = len(seed.get("sources", []))
    authoritative = sum(
        1 for s in seed.get("sources", []) if s.get("type") in ("primary", "scholarship")
    )
    reasons = []
    if authoritative < MIN_SOURCES_AUTO:
        reasons.append(f"only {authoritative} authoritative sources (need {MIN_SOURCES_AUTO})")
    if conflicts:
        reasons.append("; ".join(
            c.get("note", c["field"]) for c in conflicts))
    rec["mergeSuggestion"] = "auto" if not reasons else "review_required"
    rec["reviewReasons"] = reasons
    return rec


def cmd_match(args):
    seeds = json.loads(Path(args.seeds).read_text(encoding="utf-8"))
    out = {}
    counts = {"matched": 0, "ambiguous": 0, "no_match": 0}
    for seed in seeds:
        rec = match_seed(seed)
        # carry the editorial payload through for the promote step
        rec["payload"] = {k: seed[k] for k in ("title", "narrative", "sources")
                          if k in seed}
        out[seed["key"]] = rec
        counts[rec["status"]] = counts.get(rec["status"], 0) + 1
        flag = {"matched": "OK ", "ambiguous": "?? ", "no_match": "-- "}[rec["status"]]
        extra = ""
        if rec["status"] == "matched":
            extra = f"IdCaso {rec['idCaso']} -> {rec['mergeSuggestion']}"
            if rec.get("conflicts"):
                extra += f"  [{len(rec['conflicts'])} conflict(s)]"
        elif rec["status"] == "ambiguous":
            extra = f"{len(rec['candidateIdCasos'])} candidates in {rec['candidatesInMuniYear']}"
        print(f"  {flag}{seed['key']:<28} {extra}")
    Path(args.out).write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{counts} -> {args.out}")


def cmd_ingest(args):
    """Merge a finished batch-workflow result into the curation pipeline:
    seeds + unverified drafts -> annotation_seeds.json; real rejections -> the
    drop log. Idempotent (dedupes by key / idCaso). Then run `match`."""
    data = json.loads(Path(args.result).read_text(encoding="utf-8"))
    res = data.get("result", data)  # task .output wraps the return under "result"
    seeds = json.loads(SEEDS.read_text(encoding="utf-8")) if SEEDS.exists() else []
    have = {s["key"] for s in seeds}
    added = 0
    for s in res.get("seeds", []) + res.get("unverified", []):
        if s["key"] not in have:
            seeds.append(s); have.add(s["key"]); added += 1
    SEEDS.write_text(json.dumps(seeds, ensure_ascii=False, indent=2), encoding="utf-8")

    log_path = ROOT / "pipeline" / "annotation_dropped.json"
    drops = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else []
    seen = {x["idCaso"] for x in drops}
    dadd = 0
    for x in res.get("dropped", []):
        if x["reason"] != "insufficient_coverage" and x["reason"] != "refuted":
            continue  # only record genuine determinations
        if "finder returned null" in x.get("note", "") or "verify agent null" in x.get("note", ""):
            continue  # infra failures are not determinations — leave for re-run
        if x["idCaso"] not in seen:
            drops.append(x); seen.add(x["idCaso"]); dadd += 1
    log_path.write_text(json.dumps(drops, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"ingested {added} seeds ({len(res.get('unverified', []))} unverified), "
          f"{dadd} new rejections. Now run: python pipeline/match_event.py match")


def cmd_resolve(args):
    hits = resolve_muni(args.name, args.dept)
    if not hits:
        print("no match"); return
    for code, nm, dp in hits:
        print(f"  {code}  {nm} — {dp}")


def cmd_promote(args):
    cands = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    if args.key not in cands:
        raise SystemExit(f"no candidate {args.key!r}; run match first")
    rec = cands[args.key]
    if rec["status"] != "matched":
        raise SystemExit(f"{args.key} is {rec['status']}, not promotable")
    mode = rec["mergeSuggestion"]
    if mode == "review_required" and not args.reviewer:
        raise SystemExit(
            f"{args.key} is review_required ({'; '.join(rec['reviewReasons'])}); "
            "re-run with --reviewer NAME to sign off")
    ann = json.loads(ANNOTATIONS.read_text(encoding="utf-8")) if ANNOTATIONS.exists() else {}
    p = rec["payload"]
    ann[str(rec["idCaso"])] = {
        "idCaso": rec["idCaso"],
        "match": {
            "modality": rec["seed"]["modality"],
            "municipioDane": rec["seed"]["municipioDane"],
            "date": rec["coded"]["date"],
            "codedVictims": rec["coded"]["victims"],
            "codedResponsible": f'{rec["coded"]["responsible"]} / {rec["coded"]["responsibleGroup"]}',
            "candidatesInMuniYear": rec["candidatesInMuniYear"],
            "disambiguatedBy": rec["disambiguatedBy"],
        },
        "merge": {
            "mode": mode,
            "reason": "; ".join(rec["reviewReasons"]) or None,
            "reviewedBy": args.reviewer,
            "reviewedOn": args.date,  # owner passes an ISO date; never auto-stamped
        },
        "title": p["title"],
        "narrative": p["narrative"],
        "sources": p["sources"],
    }
    ANNOTATIONS.write_text(json.dumps(ann, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"promoted {args.key} -> annotations.json [{rec['idCaso']}] mode={mode}")


def cmd_validate(args):
    """Re-check every annotations.json entry against the gate and the binary.

    BROKEN (always exit 1): IdCaso absent from violence.bin, or auto-merge with
    too few authoritative sources — these must never ship.
    PENDING (warn; exit 1 only with --strict): review_required but unsigned —
    awaiting owner sign-off, not invalid.
    """
    if not ANNOTATIONS.exists():
        print("no annotations.json"); return
    ann = json.loads(ANNOTATIONS.read_text(encoding="utf-8"))
    meta = json.loads((OUT / "violence_meta.json").read_text(encoding="utf-8"))
    blob = (OUT / "violence.bin").read_bytes()
    L = meta["buffers"]["id"]
    ids = set(np.frombuffer(blob, np.uint32, L["length"], L["offset"]).tolist())
    broken, pending = 0, 0
    for k, a in ann.items():
        n_auth = sum(1 for s in a["sources"] if s.get("type") in ("primary", "scholarship"))
        if a["idCaso"] not in ids:
            broken += 1
            print(f"  BROKEN {k}: IdCaso NOT in violence.bin")
        elif a["merge"]["mode"] == "auto" and n_auth < MIN_SOURCES_AUTO:
            broken += 1
            print(f"  BROKEN {k}: auto-merge but only {n_auth} authoritative sources")
        elif a["merge"]["mode"] == "review_required" and not a["merge"]["reviewedBy"]:
            pending += 1
            print(f"  PENDING {k}: review_required, awaiting owner sign-off")
    print(f"{len(ann)} entries - {broken} broken, {pending} pending"
          + ("  - all valid" if not (broken or pending) else ""))
    sys.exit(1 if broken or (pending and args.strict) else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("resolve", help="municipio name -> DANE code")
    r.add_argument("name")
    r.add_argument("--dept", default=None)
    r.set_defaults(func=cmd_resolve)

    m = sub.add_parser("match", help="run the gate over the seeds file")
    m.add_argument("--seeds", default=str(SEEDS))
    m.add_argument("--out", default=str(CANDIDATES))
    m.set_defaults(func=cmd_match)

    p = sub.add_parser("promote", help="candidate -> annotations.json")
    p.add_argument("--key", required=True)
    p.add_argument("--reviewer", default=None, help="owner name (required for review_required)")
    p.add_argument("--date", default=None, help="ISO review date, e.g. 2026-06-22")
    p.set_defaults(func=cmd_promote)

    v = sub.add_parser("validate", help="re-check annotations.json against the gate")
    v.add_argument("--strict", action="store_true",
                   help="treat pending (unsigned) entries as failures too")
    v.set_defaults(func=cmd_validate)

    ing = sub.add_parser("ingest", help="merge a finished batch-workflow result file")
    ing.add_argument("--result", required=True, help="path to the task .output JSON")
    ing.set_defaults(func=cmd_ingest)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
