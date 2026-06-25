"""Download the WRI / Google DeepMind "Global drivers of forest loss" 1 km raster.

A neural-net classification of the DOMINANT driver of tree-cover loss per 1 km
cell over the whole period (single class per cell, NOT a per-year map). Band 1
(`classification`) encodes 1..7:

  1 Permanent agriculture     5 Wildfire
  2 Hard commodities          6 Settlements and infrastructure
  3 Shifting cultivation      7 Other natural disturbances
  4 Logging

It feeds the deforestation view's per-year "causes" panel: we intersect this
class with Hansen `lossyear` (pipeline/build_deforestation.py) to attribute each
loss cell to a driver. See docs/data-sources-deforestation.md.

IMPORTANT (data integrity):
  - The driver attribution is TIME-INVARIANT: one dominant driver per 1 km cell
    for 2001..2023. Any year-to-year movement in the causes chart comes only from
    Hansen's loss timing, NOT from drivers changing per year. Must stay labeled.
  - The 7 global classes are NOT IDEAM's Colombia-specific drivers; this is a
    differently-defined artifact, shown alongside the curated IDEAM ranking.
  - "Drivers of tree-cover LOSS" (Hansen definition) != IDEAM deforestation.

Source/citation: Sims, M., R. Stanimirova, A. Raichuk, M. Neumann, et al. (2025),
"Global drivers of forest loss at 1 km resolution", Environmental Research Letters,
DOI 10.1088/1748-9326/add606. Data: Zenodo record 15225267,
drivers_forest_loss_1km_2001_2023_v1_1.tif. License: CC BY 4.0.

Usage: python pipeline/download_drivers.py
Output: data/raw/drivers/drivers_forest_loss_1km_2001_2023_v1_1.tif + manifest.json
"""

import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

VERSION = "v1_1_2001_2023"
FILE = "drivers_forest_loss_1km_2001_2023_v1_1.tif"
URL = f"https://zenodo.org/records/15225267/files/{FILE}?download=1"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "drivers"
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: Path) -> int:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=3600) as r, open(dest, "wb") as f:
        expected = int(r.headers.get("Content-Length") or 0)
        copied = 0
        for chunk in iter(lambda: r.read(1 << 20), b""):
            f.write(chunk)
            copied += len(chunk)
    if expected and copied != expected:
        raise RuntimeError(f"truncated download: {copied} of {expected} bytes for {url}")
    return copied


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / FILE
    if dest.exists() and dest.stat().st_size > 0:
        print(f"cached: {FILE} ({dest.stat().st_size} bytes)")
    else:
        print(f"fetch:  {URL}")
        n = fetch(URL, dest)
        print(f"  -> {n} bytes")

    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "name": "WRI/Google DeepMind Global Drivers of Forest Loss (1 km)",
        "version": VERSION,
        "band": ("classification (dominant driver per 1 km cell, time-invariant): "
                 "1 permanent agriculture, 2 hard commodities, 3 shifting cultivation, "
                 "4 logging, 5 wildfire, 6 settlements and infrastructure, "
                 "7 other natural disturbances"),
        "resolution": "0.01 deg (~1 km at equator), EPSG:4326",
        "publisher": "World Resources Institute / Land & Carbon Lab / Google DeepMind",
        "citation": ("Sims, M., R. Stanimirova, A. Raichuk, M. Neumann, et al. (2025), "
                     "Global drivers of forest loss at 1 km resolution, Environmental "
                     "Research Letters, DOI 10.1088/1748-9326/add606. Data: Zenodo 15225267."),
        "license": "CC BY 4.0",
        "integrity_note": ("TIME-INVARIANT dominant driver per cell (not a per-year map); "
                           "7 global classes, NOT IDEAM Colombia drivers; tree-cover-loss "
                           "drivers (Hansen definition), not IDEAM deforestation."),
        "files": [{
            "file": f"data/raw/drivers/{FILE}",
            "source_url": URL,
            "bytes": dest.stat().st_size,
            "sha256": sha256_file(dest),
        }],
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"done: {dest.stat().st_size} bytes -> {OUT}")


if __name__ == "__main__":
    main()
