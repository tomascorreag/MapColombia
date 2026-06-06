"""Download DANE MGN (Marco Geoestadistico Nacional) municipio polygons.

Provides the municipality boundary polygons for the choropleth layers. The MGN
is DANE's official geostatistical framework; the municipio-political level
(MGN_MPIO_POLITICO) carries the 5-digit DANE/DIVIPOLA code per polygon, which
is this project's geographic join key.

Vintage: MGN2023 (closest to the DIVIPOLA centroid snapshot in use). The zip
holds a shapefile (~68 MB); it stays in data/raw/ and is simplified by
pipeline/build_frontend_data.py into a small GeoJSON for the frontend.

Terms: DANE publishes the MGN for open download on its Geoportal; per DANE's
terms the data is freely usable with attribution to DANE
(https://www.dane.gov.co/ - "Marco Geoestadistico Nacional").

Usage: python pipeline/download_mgn.py
Output: data/raw/mgn/MGN2023_MPIO_POLITICO.zip + data/raw/mgn/manifest.json
"""

import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

VINTAGE = "MGN2023"
FNAME = f"{VINTAGE}_MPIO_POLITICO.zip"
URL = f"https://geoportal.dane.gov.co/descargas/mgn_2023/{FNAME}"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "mgn"
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / FNAME

    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=900) as r, open(dest, "wb") as f:
        expected = int(r.headers.get("Content-Length") or 0)
        copied = 0
        for chunk in iter(lambda: r.read(1 << 20), b""):
            f.write(chunk)
            copied += len(chunk)
    if expected and copied != expected:
        raise RuntimeError(f"truncated download: {copied} of {expected} bytes")

    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "name": "Marco Geoestadistico Nacional - nivel municipio (MGN_MPIO_POLITICO)",
        "publisher": "DANE - Departamento Administrativo Nacional de Estadistica",
        "vintage": VINTAGE,
        "source_url": URL,
        "license_note": ("Open download from the DANE Geoportal "
                         "(descarga del Marco Geoestadistico Nacional); "
                         "attribution: DANE, Marco Geoestadistico Nacional."),
        "file": f"data/raw/mgn/{FNAME}",
        "bytes": dest.stat().st_size,
        "sha256": sha256_file(dest),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                                       encoding="utf-8")
    print(f"done: {dest} ({dest.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
