"""Download legality boundary layers for the deforestation view (Phase 2b).

Classifies forest loss by whether clearing was permitted *at that location*. The
compelling, clean signal is loss INSIDE protected areas and forest reserves —
where clearing is unambiguously restricted. Two no-auth ArcGIS REST sources,
fetched as EPSG:4326 GeoJSON (matching the build grid):

  - RUNAP / SINAP protected areas (Parques Nacionales). Clearing inside is illegal.
    1882 polygons. Fields: ap_categor (category), ap_nombre (name).
  - Reserva Forestal de Ley 2ª de 1959 (SIAC/MADS). Restricted-use forest reserve.
    8 zones. Fields: nom_ley2 (zone name).

DEFERRED (documented, not in MVP):
  - UPRA Frontera Agrícola Nacional — 465,583 features on a server with a broken TLS
    chain; too large/fragile, and "outside the frontier" is a fuzzier signal than
    "inside a park/reserve". Revisit if the per-cell frontier mask is wanted.
  - Resguardos / consejos comunitarios — collective tenure is a separate dimension,
    not a legality verdict; no free codes-texture channel in the MVP.

IMPORTANT (data integrity):
  - Legality here is ZONAL, not adjudicated: "inside a park" = land use not permitted
    THERE, never a verdict against a person (we cannot see permits/rights per pixel).
  - Boundaries are single-vintage (RUNAP live; Ley 2ª 1959 zones) judged against loss
    across 2001-2025 — labeled in-UI, never presented as an anachronistic fact.

Usage: python pipeline/download_boundaries.py
Output: data/raw/boundaries/{runap,ley2}.geojson + manifest.json
"""

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "boundaries"
RETRIES = 5
PAGE = 1000                         # RUNAP FeatureServer maxRecordCount is 1000
OFFSET_DEG = 0.002                  # ~200 m geometry generalization (cells ~695 m)
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}

SOURCES = {
    "runap": {
        "base": ("https://mapas.parquesnacionales.gov.co/arcgis/rest/services/"
                 "pnn/runap/FeatureServer/0/query"),
        "outFields": "ap_categor,ap_nombre",
        "name": "RUNAP / SINAP protected areas (Parques Nacionales Naturales)",
        "citation": ("Registro Único Nacional de Áreas Protegidas (RUNAP), Sistema "
                     "Nacional de Áreas Protegidas (SINAP), Parques Nacionales "
                     "Naturales de Colombia."),
        "license_note": "MADS open data (explicit license on the file UNVERIFIED).",
    },
    "ley2": {
        "base": ("https://services6.arcgis.com/hxAwRYAu9QHliJ8T/arcgis/rest/services/"
                 "Reserva_Forestal_Nacional/FeatureServer/8/query"),
        "outFields": "nom_ley2,area_ha",
        "name": "Reserva Forestal de Ley 2ª de 1959",
        "citation": ("Reservas Forestales de Ley 2ª de 1959, Sistema de Información "
                     "Ambiental de Colombia (SIAC) / Ministerio de Ambiente (MADS)."),
        "license_note": "CC BY 4.0 (SIAC DCAT).",
    },
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_page(base: str, out_fields: str, offset: int) -> dict:
    params = {
        "where": "1=1",
        "outFields": out_fields,
        "returnGeometry": "true",
        "outSR": "4326",
        "maxAllowableOffset": str(OFFSET_DEG),
        "geometryPrecision": "5",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE),
        "f": "geojson",
    }
    url = base + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read().decode("utf-8"))
            if "error" in data:
                raise RuntimeError(f"ArcGIS error at offset {offset}: {data['error']}")
            return data
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            wait = 5 * attempt
            print(f"  retry {attempt}/{RETRIES} at offset {offset} after {e} (wait {wait}s)")
            time.sleep(wait)
    raise RuntimeError(f"failed after {RETRIES} retries at offset {offset}: {last}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = []
    for key, src in SOURCES.items():
        print(f"fetch {key}: {src['base']}")
        features = []
        offset = 0
        while True:
            page = fetch_page(src["base"], src["outFields"], offset)
            feats = page.get("features", [])
            features.extend(feats)
            print(f"  offset {offset}: +{len(feats)} (total {len(features)})")
            if len(feats) < PAGE:
                break
            offset += PAGE
        dest = OUT / f"{key}.geojson"
        dest.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                   ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
        files.append({
            "key": key,
            "file": f"data/raw/boundaries/{key}.geojson",
            "source_base": src["base"],
            "n_features": len(features),
            "out_fields": src["outFields"],
            "name": src["name"],
            "citation": src["citation"],
            "license_note": src["license_note"],
            "crs": "EPSG:4326 (requested outSR)",
            "geometry_note": f"generalized maxAllowableOffset={OFFSET_DEG} deg (~200 m)",
            "bytes": dest.stat().st_size,
            "sha256": sha256_file(dest),
        })

    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "name": "Legality boundary layers (RUNAP protected areas; Ley 2ª forest reserves)",
        "deferred": ("UPRA Frontera Agrícola (465k features, broken TLS chain); "
                     "resguardos/consejos (tenure dimension, no free texture channel)."),
        "integrity_note": ("ZONAL legality, not adjudicated. Single-vintage boundaries judged "
                           "against 2001-2025 loss — labeled in-UI, never anachronistic fact."),
        "files": files,
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"done: {len(files)} layers -> {OUT}")


if __name__ == "__main__":
    main()
