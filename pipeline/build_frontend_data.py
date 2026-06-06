"""Build frontend-ready data artifacts from raw downloads.

Inputs (all under data/raw/, fetched by the download_* scripts):
  - cnmh/geoportal/casos_*.csv   : 11 SIEVCAC modalities, event-level, corte 2026-03-31
  - cede/electoral/*.tab         : camara/senado/presidencia 1958-2022, candidate-level
  - cede/electoral/Partidos_Electorales.dta : codigo_partido -> party name labels
  - divipola/municipios.csv      : DANE municipio centroids (MinSalud)
  - mgn/MGN2023_MPIO_POLITICO.zip : DANE MGN municipio boundary polygons

Outputs (data/processed/frontend/):
  - munis.json          : municipio lookup — DANE code, name, dept, centroid
  - violence.bin        : binary columnar event buffers (deck.gl-ready), sorted by
                          (modality, year) so each modality is a contiguous slice
  - violence_meta.json  : buffer layout, modality slices + per-year counts,
                          responsible-group tables, exclusion accounting, citations
  - elections.json      : per body/election: winner party per municipio (sum of
                          votos by codmpio x partido), party color table, citations
  - munis_shapes.json   : simplified MGN municipio polygons keyed to munis.json
  - memoria.json        : per body/election: vote-share-weighted left-right score
                          per municipio + coverage, from the cited party_lr table

Data-integrity rules (CLAUDE.md):
  - No fabrication: events with unknown year (Anio_hecho<=0) or out-of-range coords
    are EXCLUDED from the artifact and COUNTED in meta — never imputed.
  - Display window is 1958-present: pre-1958 events excluded + counted.
  - Unknown month/day -> day = -1 (year-level display only).
  - Every dataset carries its source id/DOI + license in meta; every violence point
    carries its CNMH IdCaso.

Usage: python pipeline/build_frontend_data.py
"""

import glob
import json
import re
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from pandas.io.stata import StataReader

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed" / "frontend"

EPOCH = date(1958, 1, 1)
YEAR_MIN, YEAR_MAX = 1958, 2026
N_YEARS = YEAR_MAX - YEAR_MIN + 1
# generous Colombia bounding box (incl. San Andres y Providencia, Amazon trapezoid)
LAT_RANGE = (-4.5, 14.0)
LON_RANGE = (-82.5, -66.5)

MODALITY_ORDER = ["MA", "AS", "DF", "SE", "RU", "MI", "VS", "AT", "AP", "AB", "DB"]

# Canonical DANE department names (DIVIPOLA two-digit codes). Constant reference
# data — the CEDE .tab files have irrecoverably corrupted accents (U+FFFD).
DEPT_NAMES = {
    5: "Antioquia", 8: "Atlántico", 11: "Bogotá D.C.", 13: "Bolívar",
    15: "Boyacá", 17: "Caldas", 18: "Caquetá", 19: "Cauca", 20: "Cesar",
    23: "Córdoba", 25: "Cundinamarca", 27: "Chocó", 41: "Huila",
    44: "La Guajira", 47: "Magdalena", 50: "Meta", 52: "Nariño",
    54: "Norte de Santander", 63: "Quindío", 66: "Risaralda", 68: "Santander",
    70: "Sucre", 73: "Tolima", 76: "Valle del Cauca", 81: "Arauca",
    85: "Casanare", 86: "Putumayo", 88: "San Andrés y Providencia",
    91: "Amazonas", 94: "Guainía", 95: "Guaviare", 97: "Vaupés", 99: "Vichada",
}

# Display palette for parties (visualization choice, not data). Liberal red and
# Conservador blue follow century-old Colombian convention; the rest are chosen
# for distinguishability on a dark map. Matched on accent-stripped uppercase.
PARTY_COLOR_RULES = [
    (r"^PARTIDO LIBERAL COLOMBIANO", "#e8403a"),
    (r"^PARTIDO CONSERVADOR COLOMBIANO", "#2d6fd6"),
    (r"^MOVIMIENTO REVOLUCIONARIO LIBERAL", "#ff8d80"),
    (r"ALIANZA NACIONAL POPULAR", "#f59e2d"),  # ANAPO
    (r"^UNION PATRIOTICA", "#8fd14f"),
    (r"^NUEVO LIBERALISMO", "#ffb3ab"),
    (r"PARTIDO SOCIAL DE UNIDAD NACIONAL|PARTIDO DE LA U\b", "#f4762e"),
    (r"^CENTRO DEMOCRATICO", "#7fb2e5"),
    (r"^CAMBIO RADICAL", "#b04a98"),
    (r"^POLO DEMOCRATICO", "#ffd23f"),
    (r"VERDE", "#3fae6a"),
    (r"^PACTO HISTORICO|COLOMBIA HUMANA", "#9046cf"),
    (r"^MOVIMIENTO 19 DE ABRIL|ALIANZA DEMOCRATICA M-?19", "#1fb8a6"),
    (r"LIGA DE GOBERNANTES ANTICORRUPCION", "#c9a227"),
    (r"^PARTIDO COMUNISTA", "#c22d50"),
    (r"^OTROS PARTIDOS O MOVIMIENTOS", "#8a8f98"),
]
FALLBACK_PALETTE = [
    "#d4a5e0", "#6fc7c4", "#e0c468", "#9aa7e0", "#c7906f", "#7fcf9e",
    "#e08aa5", "#8fb8d4", "#d4cf8a", "#b39ddb", "#90caf9", "#ffab91",
]
PARTY_GRAY = "#6b7280"


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def norm_party(s: str) -> str:
    return re.sub(r"\s+", " ", strip_accents(str(s)).upper().strip())


# ---------------------------------------------------------------- municipios

def build_munis():
    df = pd.read_csv(RAW / "divipola" / "municipios.csv")
    df = df.sort_values("idmupio").reset_index(drop=True)

    codes = df.idmupio.astype(int).tolist()
    munis = {
        "codes": codes,
        "names": df.nommpio.astype(str).tolist(),
        "depts": [DEPT_NAMES.get(d, str(d)) for d in df.iddepto.astype(int)],
        "lat": [round(v, 6) for v in df.mpiolatitud],
        "lon": [round(v, 6) for v in df.mpiolongitud],
    }
    divi_manifest = json.loads((RAW / "divipola" / "manifest.json").read_text(encoding="utf-8"))
    munis["meta"] = {
        "source": divi_manifest["name"],
        "dataset_id": divi_manifest["dataset_id"],
        "attribution": divi_manifest["attribution"],
        "license": divi_manifest["license"],
        "n": len(codes),
        "centroid_semantics": ("municipality AREA centroids, not urban centers "
                               "(e.g. Leticia's centroid lies ~75 km north of "
                               "the town in its large Amazonian territory)"),
    }
    (OUT / "munis.json").write_text(json.dumps(munis, ensure_ascii=False), encoding="utf-8")
    print(f"munis.json: {len(codes)} municipios")
    return {c: i for i, c in enumerate(codes)}


# ------------------------------------------------------------------ violence

def days_since_epoch(y, m, d):
    if m < 1 or m > 12 or d < 1:
        return -1
    try:
        return (date(int(y), int(m), int(d)) - EPOCH).days
    except ValueError:  # e.g. Feb 30 in source
        return -1


def build_violence(muni_idx):
    cnmh_manifest = json.loads((RAW / "cnmh" / "manifest.json").read_text(encoding="utf-8"))
    geoportal = {d["modality"]: d for d in cnmh_manifest["datasets"]
                 if d.get("family") == "geoportal" and d.get("kind") == "casos"}

    frames, modalities = [], []
    cat_table, grp_table = [], []  # responsible: broad category / specific group
    cat_idx, grp_idx = {}, {}

    for mod in MODALITY_ORDER:
        entry = geoportal[mod]
        df = pd.read_csv(ROOT / entry["file"], low_memory=False, usecols=[
            "IdCaso", "Anio_hecho", "mes_hecho", "dia_hecho", "Nombre_Tipo",
            "Total_Victimas_Caso", "Geo_municipio", "Presunto_Responsable",
            "Descripcion_Presunto_Responsabl", "Latitud", "Longitud"])
        total = len(df)
        name_es = df.Nombre_Tipo.mode().iat[0]

        yr = pd.to_numeric(df.Anio_hecho, errors="coerce").fillna(0).astype(int)
        lat = pd.to_numeric(df.Latitud, errors="coerce")
        lon = pd.to_numeric(df.Longitud, errors="coerce")
        ok_coord = lat.between(*LAT_RANGE) & lon.between(*LON_RANGE)
        # Geo_municipio null/0/XX000 = municipality unknown; CNMH fills those
        # coords with the DEPARTMENT centroid (verified: one unique coord per
        # dept). Plotting them would fabricate spatial precision -> exclude.
        mcode = pd.to_numeric(df.Geo_municipio, errors="coerce").fillna(0).astype(int)
        placeholder = (mcode % 1000 == 0)
        undated = int((yr <= 0).sum())
        pre1958 = int(((yr > 0) & (yr < YEAR_MIN)).sum())
        post_max = int((yr > YEAR_MAX).sum())
        in_window = (yr >= YEAR_MIN) & (yr <= YEAR_MAX)
        bad_coord = int((~ok_coord & in_window).sum())
        no_muni = int((placeholder & in_window & ok_coord).sum())

        keep = in_window & ok_coord & ~placeholder
        # exclusion buckets must partition the dropped rows exactly — fail loudly
        # if a future data cut introduces an uncounted case
        assert undated + pre1958 + post_max + bad_coord + no_muni + int(keep.sum()) == total, \
            f"{mod}: exclusion accounting does not partition rows"
        d = df[keep].copy()
        d["year"] = yr[keep]
        d["lat"] = lat[keep]
        d["lon"] = lon[keep]
        d["modality"] = len(modalities)
        d = d.sort_values("year")
        frames.append(d)

        counts = np.zeros(N_YEARS, dtype=int)
        vc = d.year.value_counts()
        counts[vc.index.to_numpy() - YEAR_MIN] = vc.to_numpy()
        modalities.append({
            "code": mod,
            "name_es": str(name_es),
            "rows_raw": total,
            "n": len(d),
            "yearCounts": counts.tolist(),
            "excluded": {"undated": undated, "pre1958": pre1958,
                         "postWindow": post_max, "badCoord": bad_coord,
                         "noMunicipio": no_muni},
            "dataset_id": entry["id"],
            "dataset_name": entry["name"],
            "source_url": entry["source_url"],
        })
        print(f"  {mod}: {len(d)}/{total} kept (undated {undated}, pre-1958 "
              f"{pre1958}, bad coord {bad_coord}, no municipio {no_muni})")

    ev = pd.concat(frames, ignore_index=True)
    n = len(ev)

    def intern(series, table, index, unknown="NO IDENTIFICADO"):
        out = np.zeros(n, dtype=np.uint8)
        for i, v in enumerate(series.fillna(unknown).astype(str)):
            v = v.strip() or unknown
            if v not in index:
                if len(table) >= 256:  # guard BEFORE uint8 assignment can wrap
                    raise ValueError(f"more than 256 distinct values: {v!r}")
                index[v] = len(table)
                table.append(v)
            out[i] = index[v]
        return out

    cat = intern(ev.Presunto_Responsable, cat_table, cat_idx)
    grp = intern(ev.Descripcion_Presunto_Responsabl, grp_table, grp_idx)

    days = np.array([days_since_epoch(y, m, d) for y, m, d in
                     zip(ev.year, pd.to_numeric(ev.mes_hecho, errors="coerce").fillna(0),
                         pd.to_numeric(ev.dia_hecho, errors="coerce").fillna(0))],
                    dtype=np.int32)
    muni = np.array([muni_idx.get(int(c), 0xFFFF) if pd.notna(c) else 0xFFFF
                     for c in ev.Geo_municipio], dtype=np.uint16)
    unmatched_muni = int((muni == 0xFFFF).sum())

    pos = np.empty(n * 2, dtype=np.float32)
    pos[0::2] = ev.lon.to_numpy(dtype=np.float32)
    pos[1::2] = ev.lat.to_numpy(dtype=np.float32)
    year = ev.year.to_numpy(dtype=np.uint16)
    victims = np.clip(pd.to_numeric(ev.Total_Victimas_Caso, errors="coerce")
                      .fillna(0).to_numpy(), 0, 0xFFFF).astype(np.uint16)
    ids = ev.IdCaso.to_numpy(dtype=np.uint32)

    # modality slice bounds (frames concatenated in MODALITY_ORDER, each year-sorted)
    start = 0
    for m in modalities:
        m["start"], m["end"] = start, start + m["n"]
        start += m["n"]

    # 4-byte-aligned buffers first, then 2-byte, then 1-byte
    buffers = [("pos", pos), ("day", days), ("id", ids),
               ("year", year), ("victims", victims), ("muni", muni),
               ("cat", cat), ("grp", grp)]
    layout, blob, offset = {}, bytearray(), 0
    for name, arr in buffers:
        b = arr.tobytes()
        layout[name] = {"offset": offset, "length": len(arr),
                        "dtype": str(arr.dtype), "bytes": len(b)}
        blob.extend(b)
        offset += len(b)

    (OUT / "violence.bin").write_bytes(blob)
    meta = {
        "n": n,
        "epoch": EPOCH.isoformat(),
        "yearMin": YEAR_MIN,
        "yearMax": YEAR_MAX,
        "buffers": layout,
        "modalities": modalities,
        "respCategories": cat_table,
        "respGroups": grp_table,
        "unmatchedMuni": unmatched_muni,
        "source": {
            "name": "CNMH — SIEVCAC, Observatorio de Memoria y Conflicto",
            "corte": "2026-03-31",
            "publisher": "Centro Nacional de Memoria Histórica",
            "via": "datos.gov.co / CNMH ArcGIS Geoportal",
            "license_note": ("geoportal cut license unstated; the 2024-09-30 "
                             "socrata cut of the same system is CC BY-SA 4.0"),
        },
        "integrity": ("Events with unknown year (Anio_hecho=0), pre-1958 dates, "
                      "out-of-range coordinates, or unknown municipality (whose "
                      "source coordinates are department-centroid placeholders) are "
                      "excluded and counted per modality in modalities[].excluded — "
                      "never imputed. day=-1 means exact date unknown (year-level "
                      "only). muni=65535 means the DANE code did not match the "
                      "DIVIPOLA centroid table (e.g. non-municipalized areas)."),
        "generated": datetime.now(timezone.utc).isoformat(),
    }
    (OUT / "violence_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"violence.bin: {n} events, {len(blob) / 1e6:.1f} MB; "
          f"unmatched muni {unmatched_muni}")


# ------------------------------------------------------------------ elections

SPANISH_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

# CEDE's fecha_eleccion is wrong on several files: presidencia 1958/1978 carry
# the congressional date of the same year, and camara/senado 1990/2010/2014 plus
# senado 2022 carry the presidential date. Overrides are documented historical
# facts, each with a citation; everything else uses the source value. All
# verified 2026-06-05 — see docs/data-sources.md. 1991's October date is an
# override-as-confirmation: the value is correct (special post-Constitution
# congressional election) but falls outside the Feb-Apr sanity envelope.
_W = "https://es.wikipedia.org/wiki/Elecciones_"
DATE_OVERRIDES = {
    ("presidencia", 1958, 0): (
        "1958-05-04",
        "Presidential vote held Sunday 4 May 1958 (Lleras Camargo 2,482,948 "
        "votes; cross-checked Georgetown PDBA); CEDE's 16 March is the 1958 "
        f"congressional date. {_W}presidenciales_de_Colombia_de_1958"),
    ("presidencia", 1978, 0): (
        "1978-06-04",
        "Presidential vote held Sunday 4 June 1978 (Turbay 2,503,681 votes); "
        f"CEDE's 26 February is the 1978 congressional date. {_W}presidenciales_de_Colombia_de_1978"),
    ("camara", 1990, 0): (
        "1990-03-11",
        "Congressional vote held Sunday 11 March 1990; CEDE's 27 May is the "
        f"presidential date. {_W}legislativas_de_Colombia_de_1990"),
    # (senado 1990 already carries 11 March correctly in the source — no override)
    ("camara", 1991, 0): (
        "1991-10-27",
        "CONFIRMATION, not correction: the special congressional election under "
        "the new 1991 Constitution was held Sunday 27 October 1991. "
        f"{_W}legislativas_de_Colombia_de_1991"),
    ("senado", 1991, 0): (
        "1991-10-27",
        f"Same confirmation as camara 1991. {_W}legislativas_de_Colombia_de_1991"),
    ("camara", 2010, 0): (
        "2010-03-14",
        "Congressional vote held Sunday 14 March 2010; CEDE's 30 May is the "
        f"presidential first-round date. {_W}legislativas_de_Colombia_de_2010"),
    ("senado", 2010, 0): (
        "2010-03-14",
        f"Same correction as camara 2010. {_W}legislativas_de_Colombia_de_2010"),
    ("camara", 2014, 0): (
        "2014-03-09",
        "Congressional vote held Sunday 9 March 2014; CEDE's 25 May is the "
        f"presidential first-round date. {_W}legislativas_de_Colombia_de_2014"),
    ("senado", 2014, 0): (
        "2014-03-09",
        f"Same correction as camara 2014. {_W}legislativas_de_Colombia_de_2014"),
    ("senado", 2022, 0): (
        "2022-03-13",
        "Congressional vote held Sunday 13 March 2022 (the 2022 camara file "
        "carries it correctly); CEDE's senado value 25 May 2022 matches no "
        f"election that year. {_W}legislativas_de_Colombia_de_2022"),
}


def parse_fecha(raw):
    """'29 de mayo de 1994' -> '1994-05-29'; None when unparseable (never guessed)."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    m = re.match(r"\s*(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s*$",
                 strip_accents(str(raw)).lower())
    if not m:
        return None
    day, month_name, year = int(m.group(1)), m.group(2), int(m.group(3))
    month = SPANISH_MONTHS.get(month_name)
    if not month:
        return None
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def election_date(df, year, body, rnd):
    """Source fecha_eleccion (modal value) -> ISO date, with documented overrides."""
    if (body, year, rnd) in DATE_OVERRIDES:
        return DATE_OVERRIDES[(body, year, rnd)][0]
    vals = df.fecha_eleccion.dropna()
    iso = parse_fecha(vals.mode().iat[0]) if len(vals) else None
    if iso is None:
        print(f"  WARNING: {year} {body} r{rnd}: fecha_eleccion unparseable -> date null")
        return None
    month = int(iso[5:7])
    # sanity envelope: Colombian congressional elections fall Feb-Apr,
    # presidential Feb-Jun (incl. June runoffs) in the 1958-2022 window
    ok = (1 <= month <= 4) if body in ("camara", "senado") else (2 <= month <= 6)
    if not ok or int(iso[:4]) != year:
        print(f"  WARNING: {year} {body} r{rnd}: suspicious source date {iso} (kept; verify)")
    return iso


def load_party_labels():
    with StataReader(RAW / "cede" / "electoral" / "Partidos_Electorales.dta") as r:
        r.read(convert_categoricals=False)
        labels = r.value_labels()
    lab = labels.get("codigo_partido") or next(iter(labels.values()))
    return {int(k): norm_party(v) for k, v in lab.items()}


def party_color(name, fallback_i):
    for pattern, color in PARTY_COLOR_RULES:
        if re.search(pattern, name):
            return color
    return FALLBACK_PALETTE[fallback_i % len(FALLBACK_PALETTE)]


def build_elections(muni_idx):
    code_labels = load_party_labels()
    party_table, party_index = [], {}

    def party_id(name):
        if name not in party_index:
            party_index[name] = len(party_table)
            party_table.append(name)
        return party_index[name]

    files = sorted(glob.glob(str(RAW / "cede" / "electoral" / "*.tab")))
    bodies = {"presidencia": [], "senado": [], "camara": []}

    for path in files:
        fname = Path(path).name
        m = re.match(r"(\d{4})_(camara|senado|presidencia)(_primera_vuelta|_segunda_vuelta)?\.tab",
                     fname)
        if not m:
            continue
        year, body, round_sfx = int(m.group(1)), m.group(2), m.group(3)
        rnd = {None: 0, "_primera_vuelta": 1, "_segunda_vuelta": 2}[round_sfx]

        cols = ["codmpio", "codigo_partido", "votos", "circunscripcion",
                "fecha_eleccion"]
        if body == "presidencia":
            cols += ["primer_apellido", "segundo_apellido", "nombres"]
        df = pd.read_csv(path, sep="\t", usecols=cols, low_memory=False)
        fecha = election_date(df, year, body, rnd)

        df["votos"] = pd.to_numeric(df.votos, errors="coerce").fillna(0)
        null_muni = int(df.codmpio.isna().sum())
        df = df.dropna(subset=["codmpio"])
        df["codmpio"] = df.codmpio.astype(int)

        # Keep only the PRINCIPAL constituency (territorial camara / national
        # senado / presidencia). Special constituencies (indigenous, afro,
        # exterior) are legally distinct races sharing codmpio — summing them
        # flips winners. Encoding varies by era (strings vs numeric codes), so
        # identify the principal circ empirically: the one with the largest
        # national vote total (30-100x the special ones in every file).
        circ_totals = df.groupby("circunscripcion", dropna=False).votos.sum()
        principal = circ_totals.idxmax()
        special_votes = int(circ_totals.sum() - circ_totals[principal])
        df = df[df.circunscripcion == principal]

        # Party-less rows are pseudo-entries (VOTOS EN BLANCO / NULOS / TARJETAS
        # NO MARCADAS sit in `nombres` with codigo_partido null): excluded from
        # the winner computation, votes accounted for separately.
        is_null_party = df.codigo_partido.isna()
        pseudo_votes = int(df.loc[is_null_party, "votos"].sum())
        n_partyless = int(is_null_party.sum())
        df = df[~is_null_party].copy()

        # normalize party identity: numeric codes -> label map; strings -> as-is
        if pd.api.types.is_numeric_dtype(df.codigo_partido):
            codes = df.codigo_partido.astype(int)
            df["party"] = [code_labels.get(c, f"CODIGO {c}") for c in codes]
        else:
            df["party"] = df.codigo_partido.map(norm_party)

        if body == "presidencia":
            df["cand"] = (df.nombres.fillna("") + " " + df.primer_apellido.fillna("") +
                          " " + df.segundo_apellido.fillna("")).str.strip().str.title()
            g = (df.groupby(["codmpio", "party", "cand"], sort=False)
                 .votos.sum().reset_index())
        else:
            g = df.groupby(["codmpio", "party"], sort=False).votos.sum().reset_index()

        totals = g.groupby("codmpio").votos.sum()
        winners = g.loc[g.groupby("codmpio").votos.idxmax()]

        mi, pi, wv, tv, ci = [], [], [], [], []
        candidates, cand_index = [], {}
        unmatched, consulados, zero_vote = 0, 0, 0
        for row in winners.itertuples(index=False):
            # all-zero municipio: idxmax picks an arbitrary first party — that
            # is no result at all. No-data, never a fabricated winner.
            if row.votos <= 0:
                zero_vote += 1
                continue
            idx = muni_idx.get(row.codmpio)
            if idx is None:
                # 9000-9999 = CEDE's convention for votes abroad (consulados);
                # anything else is a genuinely unmatched DANE code
                if 9000 <= row.codmpio < 10000:
                    consulados += 1
                else:
                    unmatched += 1
                continue
            mi.append(idx)
            pi.append(party_id(row.party))
            wv.append(int(row.votos))
            tv.append(int(totals[row.codmpio]))
            if body == "presidencia":
                c = row.cand
                if c not in cand_index:
                    cand_index[c] = len(candidates)
                    candidates.append(c)
                ci.append(cand_index[c])

        label = str(year) + {0: "", 1: " · 1ª vuelta", 2: " · 2ª vuelta"}[rnd]
        rec = {
            "year": year, "round": rnd, "label": label, "date": fecha,
            "circunscripcion": str(principal),
            "m": mi, "p": pi, "w": wv, "t": tv,
            "dropped": {"nullMuni": null_muni, "unmatchedMuni": unmatched,
                        "consulados": consulados, "zeroVote": zero_vote,
                        "partylessRows": n_partyless,
                        "partylessVotes": pseudo_votes,
                        "specialCircVotes": special_votes},
        }
        if body == "presidencia":
            rec["c"] = ci
            rec["candidates"] = candidates
        bodies[body].append(rec)
        print(f"  {fname}: {len(mi)} munis, winner parties {len(set(pi))}, "
              f"consulados {consulados}, unmatched {unmatched}")

    # color assignment: curated rules first; fallback palette by first appearance
    fallback_i = 0
    parties = []
    for name in party_table:
        color = None
        for pattern, c in PARTY_COLOR_RULES:
            if re.search(pattern, name):
                color = c
                break
        if color is None:
            if name.startswith("CODIGO "):
                color = PARTY_GRAY
            else:
                color = FALLBACK_PALETTE[fallback_i % len(FALLBACK_PALETTE)]
                fallback_i += 1
        parties.append({"name": name, "color": color})

    out = {
        "meta": {
            "source": {
                "name": "CEDE — Resultados Electorales de Colombia",
                "doi": "10.71590/R2KLKI",
                "publisher": "Universidad de los Andes, Facultad de Economía (CEDE)",
                "license": "CC0 1.0",
            },
            "method": ("Winner = party with the largest sum of votos by (codmpio, "
                       "partido) within the PRINCIPAL constituency of each election "
                       "file (territorial camara / national senado-presidencia; "
                       "special indigenous/afro/exterior constituencies are distinct "
                       "races and are excluded, votes counted in "
                       "dropped.specialCircVotes). Senate post-1991 is a national "
                       "constituency: the map shows the locally most-voted party, "
                       "not a seat winner. Blanco/nulos/unmarked and other "
                       "party-less rows are excluded from winners and counted in "
                       "dropped.partylessVotes. Municipios where every party has 0 "
                       "recorded votes are no-data (dropped.zeroVote), never a "
                       "winner. Ties broken by first occurrence. Party codes newer "
                       "than the Partidos_Electorales.dta snapshot (some 2018-2022 "
                       "coalitions) appear as 'CODIGO N' in gray. Election dates "
                       "come from the source fecha_eleccion column; documented "
                       "overrides (DATE_OVERRIDES, cited in docs/data-sources.md) "
                       "correct files where CEDE carries the congressional date on "
                       "a presidential election."),
            "generated": datetime.now(timezone.utc).isoformat(),
        },
        "parties": parties,
        "bodies": bodies,
    }
    p = OUT / "elections.json"
    p.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"elections.json: {sum(len(v) for v in bodies.values())} elections, "
          f"{len(parties)} parties, {p.stat().st_size / 1e6:.1f} MB")


# -------------------------------------------------------------------- shapes

SIMPLIFY_TOL = 0.004  # degrees (~440 m): topology-preserving coverage simplify


def build_shapes(muni_idx):
    """DANE MGN municipio polygons -> simplified GeoJSON keyed to munis.json index."""
    import geopandas as gpd          # heavy geo stack only needed for this step
    from shapely import coverage_simplify, get_num_coordinates

    mgn_manifest = json.loads((RAW / "mgn" / "manifest.json").read_text(encoding="utf-8"))
    gdf = gpd.read_file(f"zip://{RAW / 'mgn' / 'MGN2023_MPIO_POLITICO.zip'}"
                        "!MGN_ADM_MPIO_GRAFICO.shp", engine="pyogrio")
    gdf = gdf.to_crs(4326)
    n_in = int(get_num_coordinates(gdf.geometry.values).sum())
    gdf["geometry"] = coverage_simplify(gdf.geometry.values, SIMPLIFY_TOL)
    n_out = int(get_num_coordinates(gdf.geometry.values).sum())

    def ring(coords):
        return [[round(x, 4), round(y, 4)] for x, y in coords]

    def geom_json(g):
        if g.geom_type == "Polygon":
            return {"type": "Polygon",
                    "coordinates": [ring(g.exterior.coords)]
                    + [ring(r.coords) for r in g.interiors]}
        return {"type": "MultiPolygon",
                "coordinates": [[ring(p.exterior.coords)]
                                + [ring(r.coords) for r in p.interiors]
                                for p in g.geoms]}

    features, unmatched = [], []
    for code_str, geom in zip(gdf.mpio_cdpmp, gdf.geometry):
        code = int(code_str)
        idx = muni_idx.get(code)
        if idx is None:
            unmatched.append(code)
        features.append({"type": "Feature",
                         "properties": {"i": idx, "c": code},
                         "geometry": geom_json(geom)})

    out = {
        "type": "FeatureCollection",
        "meta": {
            "source": mgn_manifest["name"],
            "publisher": mgn_manifest["publisher"],
            "vintage": mgn_manifest["vintage"],
            "license_note": mgn_manifest["license_note"],
            "simplify": {"method": "shapely.coverage_simplify (topology-preserving)",
                         "tolerance_deg": SIMPLIFY_TOL,
                         "vertices_in": n_in, "vertices_out": n_out},
            "join": "properties.i = index into munis.json arrays (null when the "
                    "MGN code has no DIVIPOLA centroid row); properties.c = DANE code",
            "unmatched_codes": unmatched,
            "centroids_without_polygon": sorted(
                set(muni_idx) - {int(c) for c in gdf.mpio_cdpmp}),
        },
        "features": features,
    }
    p = OUT / "munis_shapes.json"
    p.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                 encoding="utf-8")
    print(f"munis_shapes.json: {len(features)} polygons, {n_out}/{n_in} vertices, "
          f"{p.stat().st_size / 1e6:.1f} MB; unmatched codes: {unmatched or 'none'}")


# ------------------------------------------------------------------- memoria
# Interpretive layer for the "Memoria" view: per election, a vote-share-weighted
# left-right score per municipio, from a curated, citation-per-row party table
# (pipeline/party_lr.py). Separate artifact from elections.json because scores
# are scholarly interpretation, not raw results — it carries its own method and
# source table.

def build_memoria(muni_idx):
    from party_lr import PARTY_LR, CONSTITUENT_PATTERNS, LR_METHOD_NOTE

    code_labels = load_party_labels()
    compiled = [(re.compile("^" + re.escape(name) + "$"), score)
                for name, score, _basis, _url in PARTY_LR]
    constituents = [(re.compile(pat), score) for pat, score in CONSTITUENT_PATTERNS]
    score_cache = {}

    def party_score(name):
        """Curated score; coalitions without a direct row get the mean of their
        matched constituent parties (documented derivation rule); else None."""
        if name in score_cache:
            return score_cache[name]
        s = None
        for rx, sc in compiled:
            if rx.search(name):
                s = sc
                break
        if s is None and "COALICION" in name:
            hits = [sc for rx, sc in constituents if rx.search(name)]
            if hits:
                s = round(sum(hits) / len(hits), 2)
        score_cache[name] = s
        return s

    files = sorted(glob.glob(str(RAW / "cede" / "electoral" / "*.tab")))
    bodies = {"presidencia": [], "senado": [], "camara": []}
    unscored_total = {}

    for path in files:
        fname = Path(path).name
        m = re.match(r"(\d{4})_(camara|senado|presidencia)(_primera_vuelta|_segunda_vuelta)?\.tab",
                     fname)
        if not m:
            continue
        year, body, round_sfx = int(m.group(1)), m.group(2), m.group(3)
        rnd = {None: 0, "_primera_vuelta": 1, "_segunda_vuelta": 2}[round_sfx]

        df = pd.read_csv(path, sep="\t", low_memory=False,
                         usecols=["codmpio", "codigo_partido", "votos",
                                  "circunscripcion", "fecha_eleccion"])
        df["votos"] = pd.to_numeric(df.votos, errors="coerce").fillna(0)
        fecha = election_date(df, year, body, rnd)
        df = df.dropna(subset=["codmpio"])
        df["codmpio"] = df.codmpio.astype(int)

        # same principal-constituency rule as build_elections
        circ_totals = df.groupby("circunscripcion", dropna=False).votos.sum()
        df = df[df.circunscripcion == circ_totals.idxmax()]
        df = df[df.codigo_partido.notna()].copy()  # blanco/nulos excluded entirely

        if pd.api.types.is_numeric_dtype(df.codigo_partido):
            codes = df.codigo_partido.astype(int)
            df["party"] = [code_labels.get(c, f"CODIGO {c}") for c in codes]
        else:
            df["party"] = df.codigo_partido.map(norm_party)
        df["score"] = df.party.map(party_score)

        # per-election unscored accounting (national vote share per party)
        nat_total = df.votos.sum()
        unsc = (df[df.score.isna()].groupby("party").votos.sum()
                .sort_values(ascending=False))
        unscored = [{"party": p, "share": round(float(v / nat_total), 4)}
                    for p, v in unsc.items() if v / nat_total >= 0.001]
        for p, v in unsc.items():
            unscored_total[p] = unscored_total.get(p, 0) + int(v)

        g = df.groupby("codmpio").votos.sum()
        scored = df[df.score.notna()].copy()
        scored["weighted"] = scored.votos * scored.score
        gs = scored.groupby("codmpio").agg(sv=("votos", "sum"),
                                           ss=("weighted", "sum"))

        mi, ss, cov = [], [], []
        for codmpio, total in g.items():
            idx = muni_idx.get(codmpio)
            if idx is None or total <= 0:
                continue  # consulados/unmatched/zero — accounted in elections.json
            if codmpio in gs.index and gs.loc[codmpio, "sv"] > 0:
                sv = gs.loc[codmpio, "sv"]
                mi.append(idx)
                ss.append(int(round(100 * gs.loc[codmpio, "ss"] / sv)))
                cov.append(int(round(100 * sv / total)))
            else:
                mi.append(idx)
                ss.append(127)  # sentinel: no scored votes in this municipio
                cov.append(0)

        rec = {"year": year, "round": rnd, "date": fecha,
               "m": mi, "s": ss, "cov": cov, "unscored": unscored}
        if body == "presidencia" and year in (1962, 1966):
            # Frente Nacional alternation: the excluded party did not compete —
            # a left-right reading of these maps is an artifact of the pact
            rec["fn_consensus"] = True
        bodies[body].append(rec)
        mean_cov = (sum(cov) / len(cov)) if cov else 0
        print(f"  {fname}: {len(mi)} munis, mean coverage {mean_cov:.0f}%")

    out = {
        "meta": {
            "method": LR_METHOD_NOTE,
            "scale": {"-1": "izquierda", "-0.5": "centro-izquierda", "0": "centro",
                      "0.5": "centro-derecha", "1": "derecha"},
            "encoding": ("s = round(100 * sum(votos_p*score_p)/sum(votos_p scored)) "
                         "per municipio, in [-100,100]; 127 = no scored votes. "
                         "cov = round(100 * scored votes / party-attributed votes). "
                         "Blanco/nulos and special-constituency votes excluded as in "
                         "elections.json."),
            "parties_scored": [{"party": name, "score": sc, "basis": basis, "url": url}
                               for name, sc, basis, url in PARTY_LR],
            "constituent_rules": [{"pattern": pat, "score": sc}
                                  for pat, sc in CONSTITUENT_PATTERNS],
            "fn_note": ("1958-1974 Frente Nacional: presidencia 1962/1966 were "
                        "alternation elections where one traditional party did not "
                        "compete (rec.fn_consensus=true); congressional races "
                        "remained contested between the two parties."),
            "generated": datetime.now(timezone.utc).isoformat(),
        },
        "bodies": bodies,
    }
    p = OUT / "memoria.json"
    p.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    top_unscored = sorted(unscored_total.items(), key=lambda kv: -kv[1])[:10]
    print(f"memoria.json: {sum(len(v) for v in bodies.values())} elections, "
          f"{p.stat().st_size / 1e6:.1f} MB")
    print("  top unscored by total votes:",
          [(p_, f"{v:,}") for p_, v in top_unscored])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    muni_idx = build_munis()
    print("shapes:")
    build_shapes(muni_idx)
    print("violence:")
    build_violence(muni_idx)
    print("elections:")
    build_elections(muni_idx)
    print("memoria:")
    build_memoria(muni_idx)


if __name__ == "__main__":
    main()
