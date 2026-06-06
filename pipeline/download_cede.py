"""Download CEDE (Universidad de los Andes) electoral and conflict datasets.

Sources (all CC0 1.0, anonymous download via Dataverse API):
  - Resultados Electorales de Colombia (DOI 10.71590/R2KLKI): per year/body files,
    camara/senado 1958-2022, presidencia 1958-2022 (rounds split from 1994).
    .dta originals exist only through 1990; .tab (Dataverse-ingested) covers all years,
    so we take .tab for every year plus .dta where available (value labels), plus the
    Diccionario_electorales.pdf codebook and Partidos_Electorales.dta classification.
  - Panel Conflicto y Violencia (DOI 10.57924/BN57KJ): municipal conflict panel + codebook.

Scope: Chamber, Senate, Presidency only (asamblea/concejo/alcaldia/gobernacion skipped —
out of project scope). All years downloaded; the 1993+ display cut happens in the pipeline.

Usage: python pipeline/download_cede.py
Output: data/raw/cede/electoral/*, data/raw/cede/*, data/raw/cede/manifest.json
"""

import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://datahub.uniandes.edu.co/api"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "cede"
# Dataverse 403s the default urllib UA; identify as a browser-ish client
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MapColombia-DH-acquisition"}

DATASETS = {
    "electoral": "doi:10.71590/R2KLKI",
    "conflicto": "doi:10.57924/BN57KJ",
}

ELECTORAL_KEEP = re.compile(
    r"^(\d{4}_(camara|senado|presidencia(_primera_vuelta|_segunda_vuelta)?)\.(dta|tab)"
    r"|Diccionario_electorales\.pdf|Partidos_Electorales\.dta)$"
)


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def download(file_id, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return "cached"
    req = urllib.request.Request(f"{BASE}/access/datafile/{file_id}", headers=UA)
    with urllib.request.urlopen(req, timeout=600) as r:
        dest.write_bytes(r.read())
    return "downloaded"


def sha256(path):
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def main():
    manifest = {"downloaded_at": datetime.now(timezone.utc).isoformat(), "files": []}

    for key, doi in DATASETS.items():
        v = get_json(f"{BASE}/datasets/:persistentId?persistentId={doi}")["data"]["latestVersion"]
        lic = v.get("license")
        lic_name = lic.get("name") if isinstance(lic, dict) else lic
        files = v.get("files", [])
        print(f"{key} ({doi}): {len(files)} files, license {lic_name}")

        for f in files:
            df = f["dataFile"]
            name = df["filename"]
            if key == "electoral":
                if not ELECTORAL_KEEP.match(name):
                    continue
                dest = OUT / "electoral" / name
            else:
                dest = OUT / name.replace("(2021)", "_2021").replace(" ", "_")
            dest.parent.mkdir(parents=True, exist_ok=True)
            status = download(df["id"], dest)
            print(f"  {status}: {name} ({round(df.get('filesize', 0) / 1e6, 1)} MB)")
            manifest["files"].append({
                "dataset": key,
                "doi": doi,
                "dataverse_file_id": df["id"],
                "filename": name,
                "license": lic_name,
                "file": str(dest.relative_to(OUT.parent.parent.parent)),
                "bytes": dest.stat().st_size,
                "sha256": sha256(dest),
            })

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                                       encoding="utf-8")
    print(f"done: {len(manifest['files'])} files -> {OUT}")


if __name__ == "__main__":
    main()
