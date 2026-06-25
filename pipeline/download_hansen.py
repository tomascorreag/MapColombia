"""Download Hansen Global Forest Change (GFC-2025-v1.13) lossyear tiles for Colombia.

The `lossyear` band encodes year-of-tree-cover-loss per 30 m pixel: value 0 = no
loss, 1..25 = loss detected in calendar years 2001..2025. Six 10-degree granules
cover Colombia (NW-corner names 20N/10N/00N x 080W/070W). These feed the
deforestation pixel-raster layer (see docs/data-sources-deforestation.md).

IMPORTANT (data integrity): Hansen "tree-cover loss" is NOT the same as IDEAM
"deforestation" (Hansen includes plantations/fire/natural loss; IDEAM measures
permanent natural-forest conversion). Numbers differ by definition. Hansen is the
render source; IDEAM figures are cited separately for headline statistics.

Source/citation: Hansen, M. C., et al. (2013), "High-Resolution Global Maps of
21st-Century Forest Cover Change", Science 342: 850-853. Data:
https://glad.earthengine.app/ , GFC-2025-v1.13. Freely available with citation.

Usage: python pipeline/download_hansen.py
Output: data/raw/hansen/Hansen_GFC-2025-v1.13_lossyear_*.tif + manifest.json
"""

import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

VERSION = "GFC-2025-v1.13"
BASE = f"https://storage.googleapis.com/earthenginepartners-hansen/{VERSION}/"
# 10-degree tiles (NW corner) covering Colombia: lon 80W..60W, lat 20N..10S.
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
        fname = f"Hansen_{VERSION}_lossyear_{tile}.tif"
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
        "name": "Hansen Global Forest Change lossyear (year of tree-cover loss)",
        "version": VERSION,
        "band": "lossyear (0 = no loss; 1..25 = loss in 2001..2025)",
        "resolution": "~30 m (0.00025 deg) per pixel",
        "publisher": "Hansen/UMD/Google/USGS/NASA",
        "citation": ("Hansen, M. C., et al. (2013). High-Resolution Global Maps of "
                     "21st-Century Forest Cover Change. Science 342:850-853. "
                     f"Data: Global Forest Change {VERSION}."),
        "license_note": ("Freely available with citation to Hansen et al. 2013 and the "
                         "dataset version. NOT IDEAM deforestation (different definition)."),
        "files": files,
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    total = sum(f["bytes"] for f in files)
    print(f"done: {len(files)} tiles, {total} bytes total -> {OUT}")


if __name__ == "__main__":
    main()
