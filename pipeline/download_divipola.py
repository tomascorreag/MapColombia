"""Download DIVIPOLA municipality centroids (MinSalud, datos.gov.co pqwj-3fi4).

Provides the geographic anchor for municipio-level election points: 5-digit DANE
code (idmupio), municipality name, and centroid lat/lon. License: CC BY-SA 4.0,
attribution Ministerio de Salud y Proteccion Social.

Known data quirks: the Socrata CSV export is corrupted at source (accents
replaced with U+FFFD, unrecoverable), and the SODA JSON endpoint serves
double-encoded UTF-8 ("BogotÃ¡"), which IS recoverable. So we fetch JSON,
repair the mojibake per string field, and write a clean CSV.

Usage: python pipeline/download_divipola.py
Output: data/raw/divipola/municipios.csv + data/raw/divipola/manifest.json
"""

import csv
import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATASET_ID = "pqwj-3fi4"
URL = f"https://www.datos.gov.co/resource/{DATASET_ID}.json?$limit=5000&$order=idmupio"
META_URL = f"https://www.datos.gov.co/api/views/{DATASET_ID}.json"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "divipola"
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}
FIELDS = ["iddepto", "idmupio", "nommpio", "mpiolatitud", "mpiolongitud"]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fix_mojibake(s: str) -> str:
    """Reverse UTF-8-read-as-Latin-1 double encoding; no-op if already clean."""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(META_URL, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        meta = json.load(r)

    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        raw = r.read()
    rows = json.loads(raw)
    assert len(rows) < 5000, "pagination needed: dataset grew past $limit"

    dest = OUT / "municipios.csv"
    with open(dest, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for row in rows:
            w.writerow({k: fix_mojibake(row.get(k, "")) for k in FIELDS})
    note = f"{len(rows)} rows via SODA JSON; mojibake repaired per field"

    lic = meta.get("license") or {}
    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "dataset_id": DATASET_ID,
        "name": meta.get("name"),
        "attribution": meta.get("attribution"),
        "license": lic.get("name"),
        "license_url": lic.get("termsLink"),
        "source_url": URL,
        "encoding_note": note,
        "file": "data/raw/divipola/municipios.csv",
        "bytes": dest.stat().st_size,
        "sha256_original": sha256(raw),
        "sha256": sha256(dest.read_bytes()),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                                       encoding="utf-8")
    print(f"done: {dest} ({dest.stat().st_size} bytes, {note})")


if __name__ == "__main__":
    main()
