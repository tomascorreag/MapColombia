"""Download ICA Censo Nacional Bovino (per-municipio cattle inventory, by year).

The deforestation view tells the "cattle drives forest loss" story two ways: a
spatial pasture layer (CORINE) and this -- the hard per-municipio cattle head
count over time. ICA's Censo Bovino is DANE-certified (collected via the
FEDEGAN-FNG foot-and-mouth vaccination cycle); build_deforestation.py joins
`TOTAL BOVINOS` to municipios on the DANE code (`CODIGO MUNICIPIO`) so a click on a
deforestation-frontier municipio can show its cattle inventory and trend.

Verified schema (sheet `BOVINOS Y PREDIOS`, header on row 5; identical 2022/2023):
  DEPARTAMENTO | MUNICIPIO | CODIGO MUNICIPIO | <age/sex buckets> | TOTAL BOVINOS |
  No FINCAS 1-50 | 51-100 | 101-500 | 501+ | TOTAL FINCAS CON BOVINOS
`CODIGO MUNICIPIO` reads as an integer -> zero-pad to 5 (Antioquia 0xxxx loses its
leading zero). 2023 national sum = 29,642,539 head (matches ICA's published total).

IMPORTANT (data integrity):
  - This is a vaccination-cycle INVENTORY, not a deforestation measurement. Cattle
    head != pasture hectares != deforestation driver. The frontend frames the
    municipio cattle figure as correlation/context, never as proof of causation.
  - No explicit open license on the ICA pages -> PENDING OWNER REVIEW; cite
    ICA / FEDEGAN-FNG (operacion IBB).

Source: Instituto Colombiano Agropecuario (ICA), Censo Pecuario Nacional - Bovinos.
Index of years: https://www.ica.gov.co/areas/pecuaria/servicios/epidemiologia-veterinaria/censos-2016/censo-2016/censo-bovino2.aspx

Usage: python pipeline/download_ica_bovino.py
Output: data/raw/ica/ica_bovino_<year>.xls[x] + manifest.json
"""

import hashlib
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://www.ica.gov.co/areas/pecuaria/servicios/epidemiologia-veterinaria"
# municipio-level files (skip the 2018 "por-departamento" file). year -> .aspx URL.
SOURCES = {
    2019: f"{BASE}/censos-2016/censo-2018/tabla-bovinos-municipios-departamentos-2019.aspx",
    2022: f"{BASE}/censos-2016/censo-2018/censos-bovinos-2022.aspx",
    2023: f"{BASE}/censos-bovinos-2023-final.aspx",
}
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "ica"
RETRIES = 5
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_bytes(url: str) -> bytes:
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            wait = 5 * attempt
            print(f"  retry {attempt}/{RETRIES} after {e} (wait {wait}s)")
            time.sleep(wait)
    raise RuntimeError(f"failed after {RETRIES} retries: {last}")


def ext_of(blob: bytes) -> str:
    """Sniff xls (OLE2) vs xlsx (zip) by magic bytes."""
    if blob[:4] == b"PK\x03\x04":
        return "xlsx"
    if blob[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return "xls"
    return "bin"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = []
    for year, url in SOURCES.items():
        print(f"fetch {year}: {url}")
        blob = fetch_bytes(url)
        ext = ext_of(blob)
        if ext == "bin":
            print(f"  WARNING: {year} is neither xls nor xlsx (got {blob[:16]!r}); "
                  "the .aspx may have returned an HTML error page -- inspect manually.")
        dest = OUT / f"ica_bovino_{year}.{ext}"
        dest.write_bytes(blob)
        print(f"  -> {len(blob)} bytes ({ext})")
        files.append({
            "year": year,
            "file": f"data/raw/ica/{dest.name}",
            "source_url": url,
            "format": ext,
            "bytes": len(blob),
            "sha256": sha256_file(dest),
        })

    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "name": "ICA Censo Nacional Bovino (per-municipio cattle inventory)",
        "join_key": "CODIGO MUNICIPIO (5-digit DANE/DIVIPOLA; zero-pad)",
        "value_field": "TOTAL BOVINOS (per municipio); TOTAL FINCAS CON BOVINOS",
        "sheet": "BOVINOS Y PREDIOS (header on row 5)",
        "temporal": f"years {sorted(SOURCES)} (municipio-level; 2018 dept-level excluded)",
        "publisher": "Instituto Colombiano Agropecuario (ICA); data via FEDEGAN-FNG (IBB)",
        "citation": ("Censo Pecuario Nacional - Bovinos, Instituto Colombiano Agropecuario "
                     "(ICA), operacion IBB (FEDEGAN-FNG). DANE-certified statistical operation."),
        "license_note": "No explicit open license stated on ICA pages. PENDING OWNER REVIEW.",
        "integrity_note": ("Vaccination-cycle INVENTORY, not a deforestation measurement. "
                           "Cattle head != pasture ha != deforestation driver; correlation only."),
        "files": files,
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    total = sum(f["bytes"] for f in files)
    print(f"done: {len(files)} files, {total} bytes total -> {OUT}")


if __name__ == "__main__":
    main()
