"""Curated, citation-per-row reference data for the deforestation view.

Scholarly/official interpretation that is NOT derivable from the Hansen raster:
  - IDEAM official national deforestation figures (the citable headline numbers).
  - The ranked list of direct drivers of deforestation in Colombia.

Same discipline as pipeline/party_lr.py: every row carries a source; nothing is
fabricated or estimated. PENDING OWNER REVIEW before public citation.

Integrity notes:
  - IDEAM "deforestation" (permanent natural-forest conversion) != Hansen
    "tree-cover loss". The two series are different by definition; the frontend
    labels the IDEAM points as the official reference and the Hansen-derived
    curve as the rendered source.
  - No per-driver PERCENTAGES are recorded here: IDEAM publishes a ranking, not an
    official split. The frontend renders causes as a RANKED list with an explicit
    "estimated ordering, not official shares" disclaimer. A true proportional pie
    is deferred until a derived, cited share computation exists (see
    docs/data-sources-deforestation.md).
"""

# Official IDEAM national deforestation, hectares/year. Only verified, cited
# entries — leave the series sparse rather than impute. Owner can extend with
# additional cited points from IDEAM SMByC annual reports.
IDEAM_NATIONAL = [
    {
        "year": 2024,
        "ha": 113608,
        "source": ("IDEAM / Presidencia de la República (2025-07-31), «Colombia "
                   "consolidó en 2024 la segunda cifra de deforestación más baja "
                   "de la historia: 113.608 hectáreas». "
                   "https://www.ideam.gov.co/sala-de-prensa/noticia/"
                   "en-2024-colombia-consolido-la-segunda-cifra-de-deforestacion-mas-baja-en-de-la-historia"),
    },
]

# Direct drivers of deforestation, ranked (rank 1 = largest direct driver as of
# the 2024 reporting). No percentages — ranking only. One citation each.
_IDEAM_2024 = ("IDEAM / Ministerio de Ambiente (2025), cifra de deforestación 2024; "
               "la ministra de Ambiente señaló que la deforestación está hoy "
               "determinada por la praderización para ganadería y la colonización, "
               "por encima de los cultivos de uso ilícito. "
               "https://www.minambiente.gov.co/"
               "en-2024-colombia-consolido-la-segunda-cifra-de-deforestacion-mas-baja-en-de-la-historia/")

CAUSES = [
    {"rank": 1, "driver_es": "Praderización / ganadería extensiva",
     "driver_en": "Pasture conversion / extensive cattle ranching",
     "note_es": "Señalado por IDEAM como el principal motor directo en 2024, por "
                "encima de los cultivos de uso ilícito.",
     "note_en": "Identified by IDEAM as the leading direct driver in 2024, above "
                "illicit crops.",
     "source": _IDEAM_2024},
    {"rank": 2, "driver_es": "Infraestructura de transporte no planificada",
     "driver_en": "Unplanned transport infrastructure (illegal roads)",
     "note_es": "Apertura de vías ilegales que abren el bosque a la colonización.",
     "note_en": "Illegal road-building that opens forest to colonization.",
     "source": _IDEAM_2024},
    {"rank": 3, "driver_es": "Cultivos de uso ilícito",
     "driver_en": "Illicit crops",
     "note_es": "Motor histórico; ya no el principal según IDEAM (2024).",
     "note_en": "Historic driver; no longer the leading one per IDEAM (2024).",
     "source": _IDEAM_2024},
    {"rank": 4, "driver_es": "Extracción ilegal de madera",
     "driver_en": "Illegal logging",
     "note_es": "Tala y aprovechamiento forestal no autorizado.",
     "note_en": "Unauthorized logging and timber extraction.",
     "source": _IDEAM_2024},
    {"rank": 5, "driver_es": "Minería ilegal",
     "driver_en": "Illegal mining",
     "note_es": "Extracción ilícita de minerales.",
     "note_en": "Illicit mineral extraction.",
     "source": _IDEAM_2024},
    {"rank": 6, "driver_es": "Expansión de la frontera agrícola",
     "driver_en": "Agricultural-frontier expansion",
     "note_es": "Ampliación de cultivos en zonas no permitidas.",
     "note_en": "Crop expansion into non-permitted areas.",
     "source": _IDEAM_2024},
]

ATTRIBUTION_NOTE = (
    "Drivers and actors (who/why) are expert-attributed at regional level by "
    "IDEAM SMByC, FCDS and MAAP — not observed per-pixel. This ranking is "
    "interpretive context, not a measured per-driver split. PENDING OWNER REVIEW."
)

# WRI / Google DeepMind dominant-driver classes (band `classification`, 1..7).
# These are the QUANTIFIED, mappable causes used by the per-year causes panel:
# build_deforestation.py intersects this class with Hansen lossyear to get
# hectares-of-loss per (driver, year). Distinct from the IDEAM ranking above —
# global generic classes, not Colombia-specific drivers. Labels are the dataset's
# own class names (translated); the single source citation is the dataset paper.
_GDM = ("Sims, M., R. Stanimirova, A. Raichuk, M. Neumann, et al. (2025), «Global "
        "drivers of forest loss at 1 km resolution», Environmental Research Letters, "
        "DOI 10.1088/1748-9326/add606 (WRI / Land & Carbon Lab / Google DeepMind; "
        "Zenodo 15225267; CC BY 4.0).")

DRIVERS = [
    {"code": 1, "label_es": "Agricultura permanente", "label_en": "Permanent agriculture",
     "source": _GDM},
    {"code": 2, "label_es": "Materias primas duras (minería/energía)",
     "label_en": "Hard commodities (mining/energy)", "source": _GDM},
    {"code": 3, "label_es": "Agricultura migratoria", "label_en": "Shifting cultivation",
     "source": _GDM},
    {"code": 4, "label_es": "Tala / aprovechamiento forestal", "label_en": "Logging",
     "source": _GDM},
    {"code": 5, "label_es": "Incendios", "label_en": "Wildfire", "source": _GDM},
    {"code": 6, "label_es": "Asentamientos e infraestructura",
     "label_en": "Settlements and infrastructure", "source": _GDM},
    {"code": 7, "label_es": "Otras perturbaciones naturales",
     "label_en": "Other natural disturbances", "source": _GDM},
]

DRIVERS_CAVEAT = (
    "Driver of tree-cover loss per 1 km cell (WRI/Google DeepMind), a SINGLE "
    "dominant class for 2001–2023 — not a per-year survey. Year-to-year change "
    "reflects only WHEN loss occurred, attributed to each location's period-dominant "
    "driver. Generic global classes, not IDEAM's Colombia-specific drivers; "
    "tree-cover-loss drivers (Hansen definition), not IDEAM deforestation."
)

# ---- Phase 2a: KIND of agriculture (what the cleared land became) -------------
# CORINE Land Cover Colombia separates PASTURE from crops — the split MapBiomas
# fuses. We read the most recent national vintage (2022) as "subsequent land cover
# of cleared land": a proxy for land USE, not the clearing agent. Codes here mirror
# CORINE_N2_TO_KIND in build_deforestation.py (1 Pasto, 2 Cultivos, 3 Mosaico).
_CORINE = ("IDEAM, Coberturas de la Tierra (metodología CORINE Land Cover adaptada "
           "para Colombia, escala 1:100.000), periodo 2022. Sistema de Información "
           "Ambiental de Colombia (SIAC). Licencia datos abiertos IDEAM (cadena "
           "explícita no publicada en el servicio).")

AG_KINDS = [
    {"code": 1, "label_es": "Pastos (ganadería)", "label_en": "Pasture (cattle ranching)",
     "source": _CORINE},
    {"code": 2, "label_es": "Cultivos", "label_en": "Crops", "source": _CORINE},
    {"code": 3, "label_es": "Mosaico agropecuario", "label_en": "Agricultural mosaic",
     "source": _CORINE},
]

AGKIND_CAVEAT = (
    "Subsequent land COVER (CORINE Land Cover, IDEAM, 2022) of cleared cells — a "
    "proxy for land USE, NOT the clearing agent: it shows what the land IS now, not "
    "who cut it. «Pastos» is grass cover, a strong but indirect proxy for cattle "
    "ranching, never proof of it. Scale 1:100.000, unidad mínima 25 ha: small or "
    "fragmented clearing is under-resolved. Cover read against a single 2022 vintage."
)

# UNODC SIMCI coca — its OWN dimension (not merged into ag-kind), genuinely
# time-varying (earliest-detection year per cell). Monitored area, not production.
COCA_SOURCE = ("Densidad de cultivos de coca, 2001–2023. UNODC-SIMCI / Observatorio de "
               "Drogas de Colombia, Ministerio de Justicia y del Derecho. Datos Abiertos "
               "Colombia (v3rx-q7t3), CC BY-SA 4.0.")
COCA_CAVEAT = (
    "Coca = UNODC-SIMCI MONITORED cultivation area per 1 km cell (no producción ni "
    "erradicación). Loss is flagged «coca» where coca was first detected in the cell "
    "by that year — spatial-temporal CORRELATION, not proof the clearing was for coca."
)

# ICA per-municipio cattle inventory — the hard number behind the pasture story.
CATTLE_SOURCE = ("Censo Pecuario Nacional – Bovinos, Instituto Colombiano Agropecuario "
                 "(ICA), operación IBB (FEDEGAN-FNG); operación estadística certificada "
                 "por el DANE. 2022 y 2023.")
CATTLE_CAVEAT = (
    "Inventario bovino del ciclo de vacunación (ICA), no una medición de deforestación. "
    "Cabezas de ganado ≠ hectáreas de pasto ≠ motor de deforestación: contexto/"
    "correlación, nunca prueba de causalidad. Sin licencia abierta explícita."
)

# ---- Phase 2b: LEGALITY (was clearing permitted at that location?) ------------
# ZONAL classification, never an adjudicated verdict. Priority codes mirror
# N_LEGALITY / load_boundary_masks in build_deforestation.py.
LEGALITY_CLASSES = [
    {"code": 1, "label_es": "Área protegida (RUNAP)", "label_en": "Protected area (RUNAP)",
     "source": "RUNAP / SINAP, Parques Nacionales Naturales de Colombia."},
    {"code": 2, "label_es": "Reserva Forestal Ley 2ª", "label_en": "Ley 2ª forest reserve",
     "source": "Reservas Forestales de Ley 2ª de 1959, SIAC / MADS (CC BY 4.0)."},
    {"code": 3, "label_es": "Sin restricción especial", "label_en": "No special restriction",
     "source": "Default: cleared land outside RUNAP / Ley 2ª zones."},
]

LEGALITY_SOURCE = ("RUNAP / SINAP (Parques Nacionales Naturales de Colombia) y Reservas "
                   "Forestales de Ley 2ª de 1959 (SIAC / Ministerio de Ambiente).")

LEGALITY_CAVEAT = (
    "Clasificación ZONAL, no un fallo jurídico: «dentro de un parque / reserva» significa "
    "uso del suelo NO permitido ALLÍ, nunca un veredicto contra una persona (no se observan "
    "permisos ni derechos por píxel). Los límites son de una sola fecha (RUNAP vigente; zonas "
    "de Ley 2ª de 1959) y se contrastan con pérdida de 2001–2025 — fecha etiquetada, jamás "
    "presentada como hecho anacrónico. Excluye la frontera agrícola UPRA y resguardos (MVP)."
)
