"""One-shot generator for pipeline/party_lr.py from the LR research results.

Reads _lr_research_result.json (multi-agent research output, 2026-06-05),
applies the documented adjudications for the three score conflicts, drops
placeholder rows, and writes the curated table as auditable Python source.
The generated file is the reviewable artifact; this script records HOW it
was assembled.
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
data = json.loads((HERE / "_lr_research_result.json").read_text(encoding="utf-8"))

CONF = {"high": 3, "medium": 2, "low": 1}

# Conflict adjudications (score chosen + reason appended to the row note):
ADJUDICATIONS = {
    "MOVIMIENTO UNITARIO METAPOLITICO - MUM": (
        0, "ADJUDICATED: both researchers call the axis placement shaky for this "
           "esoteric-personalist vehicle; the single 'centroderecha' infobox reading "
           "is recorded here but 0 (documented, axis-resistant) is retained."),
    "CENTRO ESPERANZA: COALICION DE PARTIDO DIGNIDAD - NUEVO LIBERALISMO - "
    "COLOMBIA RENACIENTE - ALIANZA SOCIAL INDEPENDIENTE - OTROS": (
        0, "ADJUDICATED: explicit self-identity and dominant press framing is 'el "
           "centro'; the center-left reading (constituents Dignidad/NL/ASI) noted."),
    "EQUIPO POR COLOMBIA: COALICION PARTIDO CONSERVADOR COLOMBIANO - PARTIDO MIRA "
    "- CREEMOS COLOMBIA - PARTIDO DE LA UNION POR LA GENTE - VALOS PALANTE CON "
    "ECHEVERRY - OTROS": (
        0.5, "ADJUDICATED: modal Colombian press framing is 'centroderecha' and the "
             "constituent mix is center-right-to-right; en.wiki's 'centre-right and "
             "right-wing' reading noted."),
}

DROP = {"MOVIMIENTO CONVERGENCIA CIUDADANA-error", "PARTIDO COMUNISTA COLOMBIANO-dup"}

EXTRA_ROWS = [
    {
        "party": "COALICIONES DE 1982",
        "score": 0.5,
        "basis": ("CEDE code 19829998 appears ONLY in the 1982 presidencia file "
                  "(verified against 1982 camara/senado: 0 rows) and corresponds to "
                  "Belisario Betancur's Movimiento Nacional coalition candidacy "
                  "(46.8%, winner) - the conservative-led, Betancur-headed coalition "
                  "scored +0.5 like its 1978 'MOVIMIENTO NACIONAL' predecessor."),
        "url": "https://es.wikipedia.org/wiki/Elecciones_presidenciales_de_Colombia_de_1982",
        "confidence": "medium",
        "note": "Same code is a generic aggregation bucket in other cycles; safe here "
                "because it occurs in no other 1982 file.",
    },
]

best = {}
for era in data["eras"]:
    for r in era["rows"]:
        p = r["party"]
        if p in DROP:
            continue
        if p in ADJUDICATIONS:
            score, why = ADJUDICATIONS[p]
            if r["score"] != score:
                continue  # keep the row matching the adjudicated score
            r = dict(r)
            r["note"] = (r.get("note", "") + " | " + why).strip(" |")
        if p not in best or CONF[r["confidence"]] > CONF[best[p]["confidence"]]:
            best[p] = r
for r in EXTRA_ROWS:
    best[r["party"]] = r

rows = sorted(best.values(), key=lambda r: (r["score"], r["party"]))

# Constituent fragments for the derived-coalition rule (mean of matched members).
# Scores mirror the direct rows above; fragments chosen to be unambiguous inside
# 'COALICION ...' strings. Audited 2026-06-05 against every coalition string in
# the CEDE files: every DIRECTLY-SCORED party that appears inside a coalition
# name has a fragment here (a missing fragment silently drops that member from
# the mean — found and fixed for UC, Movimiento Nacional, Via Alterna, Colombia
# Siempre, MOIR, PSOC, Si Colombia, Convergencia Popular Civica, the singular
# 'COLOMBIA JUSTA LIBRE' spelling). Members WITHOUT a citable score (GOLPE,
# Vamos Colombia, regional vehicles...) are omitted from the mean by design —
# disclosed in the method note.
CONSTITUENTS = [
    (r"PARTIDO LIBERAL", -0.5),
    (r"PARTIDO CONSERVADOR", 1),
    (r"CAMBIO RADICAL", 0.5),
    (r"PARTIDO DE LA U\b|DE LA U -", 0.5),
    (r"\bMIRA\b", 0.5),
    (r"COLOMBIA JUSTA LIBRES?", 1),
    (r"PACTO HISTORICO", -1),
    (r"ALIANZA VERDE", -0.5),
    (r"POLO DEMOCRATICO", -1),
    (r"CENTRO DEMOCRATICO", 1),
    (r"SALVACION NACIONAL", 1),
    (r"MOVIMIENTO EQUIPO COLOMBIA|Y EQUIPO COLOMBIA", 1),
    (r"UNION PATRIOTICA", -1),
    (r"ALIANZA SOCIAL INDIGENA|ALIANZA SOCIAL INDEPENDIENTE", -0.5),
    (r"MOVIMIENTO MAIS|\bMAIS\b", -0.5),
    (r"NUEVO LIBERALISMO", -0.5),
    (r"NUEVA FUERZA DEMOCRATICA", 0.5),
    (r"\bMURCO\b", 1),
    (r"CENTRO ESPERANZA", 0),
    (r"\bANAPO\b", 0),
    (r"UNION CRISTIANA", 1),
    (r"\bMOVIMIENTO NACIONAL\b(?! CONSERVADOR| PROGRESISTA)", 0.5),
    (r"VIA ALTERNA", -1),
    (r"COLOMBIA SIEMPRE", 1),
    (r"\bMOIR\b", -1),
    (r"FUERZA PROGRESISTA", 1),
    (r"SOCIALDEMOCRATA COLOMBIANO", -0.5),
    (r"\bSI COLOMBIA\b", 0),
    (r"CONVERGENCIA POPULAR CIVICA", 0),
]

METHOD = (
    "Direct party scores on a 5-point scale (-1 izquierda, -0.5 centro-izquierda, "
    "0 centro, +0.5 centro-derecha, +1 derecha) for every party/coalition reaching "
    ">=1% national share (or the 97% cumulative mass) in any CEDE election file "
    "1958-2022, all three bodies. Each row carries the citation that grounds it; "
    "rows were drafted by a multi-source research pass (2026-06-05) and "
    "consolidated with documented adjudications. Parties with no citable "
    "characterization are deliberately UNSCORED (mostly regional/personalist "
    "vehicles) and excluded from the score numerator and denominator; per-municipio "
    "coverage (scored votes / party-attributed votes) is published alongside every "
    "score. Department-level 'COALICION CAMARA/SENADO. X Y Z' lists with no direct "
    "row receive the MEAN of their constituent parties that have citable scores "
    "(constituent_rules; members without a citable score are omitted from the "
    "mean) - these derived values are continuous, NOT restricted to the 5-point "
    "scale, and are a documented derivation, not a researched placement. CEDE "
    "aggregation buckets ('OTROS PARTIDOS...', 'PARTIDO DESCONOCIDO...') are "
    "unscorable by definition. Frente Nacional caveat: presidencia 1962/1966 were "
    "alternation elections (fn_consensus flag); anti-FN candidacies in 1962 are "
    "recorded as VOTOS NULOS in the source itself (~683k votes incl. Lopez "
    "Michelsen's MRL) and are excluded with the partyless rows. THIS TABLE IS "
    "SCHOLARLY INTERPRETATION - review pipeline/party_lr.py before citing the "
    "memoria view."
)

lines = [
    '"""Curated party left-right table for the Memoria view. See LR_METHOD_NOTE.',
    "",
    "Generated by _gen_party_lr.py from multi-agent cited research (2026-06-05),",
    "then adjudicated by hand. Each row: (party name as normalized CEDE string,",
    "score, basis with source, url). Edit rows here - this file is the audit",
    'artifact; scores feed build_frontend_data.build_memoria().',
    '"""',
    "",
    "LR_METHOD_NOTE = " + json.dumps(METHOD, ensure_ascii=False),
    "",
    "# (name, score, basis, url) - name matched EXACTLY (escaped/anchored) against",
    "# norm_party() output; confidence and notes folded into basis text.",
    "PARTY_LR = [",
]
for r in rows:
    basis = r["basis"]
    if r.get("note"):
        basis += " [" + r["note"] + "]"
    basis += f" (confidence: {r['confidence']})"
    lines.append("    (" + json.dumps(r["party"], ensure_ascii=False) + ",")
    lines.append(f"     {r['score']},")
    lines.append("     " + json.dumps(basis, ensure_ascii=False) + ",")
    lines.append("     " + json.dumps(r.get("url", ""), ensure_ascii=False) + "),")
lines.append("]")
lines.append("")
lines.append("# regex fragment -> score; derived-coalition rule (mean of matches)")
lines.append("CONSTITUENT_PATTERNS = [")
for pat, score in CONSTITUENTS:
    lines.append(f"    ({json.dumps(pat, ensure_ascii=False)}, {score}),")
lines.append("]")
lines.append("")

(HERE / "party_lr.py").write_text("\n".join(lines), encoding="utf-8")
print(f"party_lr.py: {len(rows)} scored rows, {len(CONSTITUENTS)} constituent rules")
