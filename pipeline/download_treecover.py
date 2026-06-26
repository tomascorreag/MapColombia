"""Download Hansen Global Forest Change (GFC-2025-v1.13) treecover2000 tiles.

The `treecover2000` band encodes percent tree canopy cover for the year 2000 per
30 m pixel (0..100). It is the standing-forest baseline that the lossyear band
later erodes. Same six 10-degree granules over Colombia as download_hansen.py,
same no-auth Google Cloud Storage bucket. Feeds the deforestation view's
jungle-green forest-density background (see build_deforestation.py).

IMPORTANT (data integrity): treecover2000 is a YEAR-2000 canopy-percent snapshot,
not a species/biomass map and not "current" forest. It is rendered as a
visualization-only backdrop, labeled as such. Loss after 2000 is shown by the
separate lossyear layer on top.

Source/citation: Hansen, M. C., et al. (2013), "High-Resolution Global Maps of
21st-Century Forest Cover Change", Science 342: 850-853. GFC-2025-v1.13.
Freely available with citation.

Usage: python pipeline/download_treecover.py
Output: data/raw/hansen/Hansen_GFC-2025-v1.13_treecover2000_*.tif (+ manifest)
"""

import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

VERSION = "GFC-2025-v1.13"
BASE = f"https://storage.googleapis.com/earthenginepartners-hansen/{VERSION}/"
TILES = ["20N_080W", "10N_080W", "00N_080W", "20N_070W", "10N_070W", "00N_070W"]
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "hansen"
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: Path) -> int:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=1800) as r, open(dest, "wb") as f:
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
    files = []
    for tile in TILES:
        fname = f"Hansen_{VERSION}_treecover2000_{tile}.tif"
        url = BASE + fname
        dest = OUT / fname
        if dest.exists() and dest.stat().st_size > 0:
            print(f"cached: {fname} ({dest.stat().st_size} bytes)")
        else:
            print(f"fetch:  {url}")
            n = fetch(url, dest)
            print(f"  -> {n} bytes")
        files.append({
            "tile": tile,
            "file": f"data/raw/hansen/{fname}",
            "source_url": url,
            "bytes": dest.stat().st_size,
            "sha256": sha256_file(dest),
        })

    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "name": "Hansen Global Forest Change treecover2000 (percent canopy, year 2000)",
        "version": VERSION,
        "band": "treecover2000 (0..100 percent canopy cover in 2000)",
        "resolution": "~30 m (0.00025 deg) per pixel",
        "publisher": "Hansen/UMD/Google/USGS/NASA",
        "citation": ("Hansen, M. C., et al. (2013). High-Resolution Global Maps of "
                     "21st-Century Forest Cover Change. Science 342:850-853. "
                     f"Data: Global Forest Change {VERSION}."),
        "license_note": ("Freely available with citation to Hansen et al. 2013 and the "
                         "dataset version. Year-2000 canopy snapshot, visualization-only."),
        "files": files,
    }
    (OUT / "manifest_treecover.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    total = sum(f["bytes"] for f in files)
    print(f"done: {len(files)} tiles, {total} bytes total -> {OUT}")


if __name__ == "__main__":
    main()
