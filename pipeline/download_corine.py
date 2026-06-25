"""Download IDEAM CORINE Land Cover (national 1:100k, 2022) agricultural polygons.

The deforestation view's "kind of agriculture" lens needs to tell PASTURE (cattle
ranching) apart from crops on cleared land. MapBiomas Colombia fuses the two and
is GEE-auth-only; IDEAM's CORINE Land Cover product instead carries a DISTINCT
Pastos class. We pull only the agricultural/pasture polygons (CORINE level-2
groups 21/22/23/24) for the most recent national vintage (2022) and rasterize
them onto the build grid in build_deforestation.py.

CORINE level-2 codes (Leyenda Nacional CORINE Land Cover adaptada, IDEAM 2010):
  2.1 Cultivos transitorios   2.3 Pastos (231 limpios, 232 arbolados, 233 enmalezados)
  2.2 Cultivos permanentes     2.4 Areas agricolas heterogeneas (241 mosaico de cultivos, ...)

IMPORTANT (data integrity):
  - This is LAND COVER, not the clearing agent: it says what a cell IS (2022), a
    proxy for land USE. Pasture cover != cattle ranching outright; labeled as a
    proxy, never as "cleared by ranchers".
  - Scale 1:100,000, minimum mapping unit 25 ha -> under-resolves small/fragmented
    clearing. Documented as a load-bearing caveat alongside Hansen-vs-IDEAM.
  - Geometry is GENERALIZED server-side (maxAllowableOffset ~200 m) because the
    build rasterizes to ~695 m cells; full-detail polygons would be wasted payload.

Source: IDEAM, Coberturas de la Tierra (metodologia CORINE Land Cover adaptada
para Colombia, escala 1:100.000), periodo 2022, via the IDEAM ArcGIS REST service
(visualizador.ideam.gov.co). License: IDEAM open-data framework (explicit license
string not stated on the service -> PENDING OWNER REVIEW; cite IDEAM/SIAC).

Usage: python pipeline/download_corine.py
Output: data/raw/corine/corine_2022_ag.geojson + manifest.json
"""

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# IDEAM Estado_Cobertura_Tierra MapServer; layer 7 = national 2022 (layer 3 = 2018).
BASE = ("https://visualizador.ideam.gov.co/gisserver/rest/services/"
        "Estado_Cobertura_Tierra/MapServer/7/query")
# Only agricultural / pasture level-2 groups; forest/natural/water/urban skipped.
WHERE = "nivel_2 IN ('21','22','23','24')"
PAGE = 8000                        # below the 20000 cap; lighter per-request payload
RETRIES = 5                        # IDEAM service is intermittently slow/throttling
OFFSET_DEG = 0.002                 # ~200 m geometry generalization (cells are ~695 m)
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "corine"
FILE = "corine_2022_ag.geojson"
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_page(offset: int) -> dict:
    params = {
        "where": WHERE,
        "outFields": "codigo,nivel_2",
        "returnGeometry": "true",
        "outSR": "4326",                 # match the EPSG:4326 build grid
        "maxAllowableOffset": str(OFFSET_DEG),
        "geometryPrecision": "5",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE),
        "f": "geojson",
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
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
    features = []
    offset = 0
    while True:
        page = fetch_page(offset)
        feats = page.get("features", [])
        features.extend(feats)
        print(f"  offset {offset}: +{len(feats)} (total {len(features)})")
        if len(feats) < PAGE:
            break
        offset += PAGE

    fc = {"type": "FeatureCollection", "features": features}
    dest = OUT / FILE
    dest.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")

    # quick class tally for sanity (231/232/233 should be a large share)
    tally: dict = {}
    for f in features:
        c = (f.get("properties") or {}).get("nivel_2")
        tally[c] = tally.get(c, 0) + 1

    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "name": "IDEAM CORINE Land Cover Colombia (national 1:100k), agricultural classes",
        "version": "periodo 2022 (MapServer layer 7)",
        "where": WHERE,
        "level2_counts": tally,
        "n_features": len(features),
        "fields": "codigo (full CORINE code), nivel_2 ('21'/'22'/'23'/'24')",
        "geometry_note": (f"generalized server-side maxAllowableOffset={OFFSET_DEG} deg "
                          "(~200 m); adequate for ~695 m raster cells, not for fine mapping"),
        "crs": "EPSG:4326 (requested outSR; native is EPSG:4686 MAGNA-SIRGAS)",
        "scale": "1:100,000, minimum mapping unit 25 ha (5 ha for artificial classes)",
        "publisher": "IDEAM / SIAC",
        "citation": ("IDEAM, Coberturas de la Tierra (metodologia CORINE Land Cover "
                     "adaptada para Colombia, escala 1:100.000), periodo 2022. "
                     "Sistema de Informacion Ambiental de Colombia (SIAC)."),
        "license_note": ("IDEAM open-data framework; explicit license string not stated "
                         "on the service. PENDING OWNER REVIEW. Cite IDEAM/SIAC."),
        "integrity_note": ("LAND COVER (what the cell is in 2022), a proxy for land use, "
                           "NOT the clearing agent. Pasture cover != cattle ranching. "
                           "25 ha MMU under-resolves small clearing."),
        "files": [{
            "file": f"data/raw/corine/{FILE}",
            "source_url": BASE + "?" + urllib.parse.urlencode(
                {"where": WHERE, "f": "geojson", "...": "paginated"}),
            "bytes": dest.stat().st_size,
            "sha256": sha256_file(dest),
        }],
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"done: {len(features)} features ({dest.stat().st_size/1e6:.1f} MB) -> {dest}")
    print(f"level-2 tally: {tally}")


if __name__ == "__main__":
    main()
