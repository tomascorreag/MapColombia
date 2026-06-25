"""Download UNODC SIMCI coca-cultivation density (1 km grid, annual 2001-2023).

The deforestation view's "kind of agriculture" lens shows coca as its own,
genuinely time-varying dimension (unlike CORINE land cover, which is a single
recent snapshot). SIMCI publishes "Densidad de Cultivos de Coca" as a 1 km x 1 km
polygon grid where each cell carries the monitored coca area (ha) for every year
2001-2023. build_deforestation.py rasterizes the per-year columns onto the build
grid and intersects with Hansen loss.

Field-name gotcha (verified from the Socrata schema): the per-year columns are NOT
regex-uniform -- most are `areacoca_YYYY`, but three break the pattern:
  areacoca_2001 .. areacoca_2003, areacoca2004, areacoca_2005 .. areacoca_2021,
  coca2022_, areacoca2023
build_deforestation.py maps them explicitly (see COCA_YEAR_FIELDS there). Also
`0.0` = monitored, none detected; a MISSING field = Socrata omitted a null.

IMPORTANT (data integrity):
  - SIMCI coca area is MONITORED/detected hectares per 1 km cell, not production,
    not eradication. Coca presence != coca-driven loss (grid-level correlation).
  - Keep "UNODC-SIMCI monitored coca" distinct from any production/eradication
    figures, same discipline as the Hansen-vs-IDEAM labeling.

Source: "Densidad de Cultivos de Coca - Subdireccion Estrategica y de Analisis",
Datos Abiertos Colombia, dataset v3rx-q7t3 (Observatorio de Drogas de Colombia /
MinJusticia; underlying data UNODC-SIMCI). License: CC BY-SA 4.0.

Usage: python pipeline/download_coca.py
Output: data/raw/coca/coca_density.geojson + manifest.json
"""

import hashlib
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATASET = "v3rx-q7t3"
URL = f"https://www.datos.gov.co/api/geospatial/{DATASET}?method=export&format=GeoJSON"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "coca"
FILE = "coca_density.geojson"
RETRIES = 5
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: Path) -> int:
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
                copied = 0
                for chunk in iter(lambda: r.read(1 << 20), b""):
                    f.write(chunk)
                    copied += len(chunk)
            return copied
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            wait = 5 * attempt
            print(f"  retry {attempt}/{RETRIES} after {e} (wait {wait}s)")
            time.sleep(wait)
    raise RuntimeError(f"failed after {RETRIES} retries: {last}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / FILE
    print(f"fetch: {URL}")
    n = fetch(URL, dest)
    print(f"  -> {n} bytes")

    # sanity: parse and report feature count + which year fields are present
    fc = json.loads(dest.read_text(encoding="utf-8"))
    feats = fc.get("features", [])
    year_fields = set()
    for f in feats[:50]:
        year_fields.update(k for k in (f.get("properties") or {}) if "coca" in k.lower())

    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "name": "UNODC SIMCI coca-cultivation density (1 km grid, annual)",
        "dataset_id": DATASET,
        "n_features": len(feats),
        "temporal": "annual 2001-2023 (one area column per year)",
        "year_fields_seen": sorted(year_fields),
        "field_note": ("per-year columns NOT regex-uniform: areacoca_2001..2003, areacoca2004, "
                       "areacoca_2005..2021, coca2022_, areacoca2023. 0.0 = monitored none; "
                       "missing field = Socrata-omitted null. grilla1 = 1km cell id."),
        "resolution": "1 km x 1 km grid cells; value = monitored coca ha within the cell",
        "crs": "EPSG:4326 (coordinates as served by the GeoJSON export)",
        "publisher": ("Observatorio de Drogas de Colombia / Ministerio de Justicia y del "
                      "Derecho; underlying data UNODC-SIMCI"),
        "citation": ("Densidad de cultivos de coca, 2001-2023. UNODC-SIMCI / Observatorio de "
                     "Drogas de Colombia, Ministerio de Justicia y del Derecho. Datos Abiertos "
                     f"Colombia ({DATASET}), CC BY-SA 4.0."),
        "license": "CC BY-SA 4.0",
        "integrity_note": ("MONITORED coca area, not production/eradication. Coca presence != "
                           "coca-driven forest loss (grid-level correlation only)."),
        "files": [{
            "file": f"data/raw/coca/{FILE}",
            "source_url": URL,
            "bytes": dest.stat().st_size,
            "sha256": sha256_file(dest),
        }],
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"done: {len(feats)} features ({dest.stat().st_size/1e6:.1f} MB) -> {dest}")
    print(f"year fields seen: {sorted(year_fields)}")


if __name__ == "__main__":
    main()
