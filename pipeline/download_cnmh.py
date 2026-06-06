"""Download CNMH SIEVCAC violence-event datasets (all modalities, full time range).

Two dataset families exist for the same SIEVCAC data:
  1. "socrata"  — native datos.gov.co tables, attribution CNMH, license CC BY-SA 4.0,
                  corte 2024-09-30. Long names ("Sistema de Información ... SIEVCAC - Casos MA ...").
  2. "geoportal" — federated datos.gov.co entries pointing at the CNMH ArcGIS Geoportal,
                  corte 2026-03-31 (current), license not stated. Short names ("Casos Masacres (MA)").

We download BOTH in full (no temporal filtering — project displays 1993+, but raw keeps
everything). Each file gets a manifest entry: source id, URL, license, description, sha256.

Usage: python pipeline/download_cnmh.py
Output: data/raw/cnmh/{socrata,geoportal}/*.csv + data/raw/cnmh/manifest.json
"""

import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CATALOG = "https://api.us.socrata.com/api/catalog/v1"
DOMAIN = "www.datos.gov.co"
VIEWS = f"https://{DOMAIN}/api/views"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "cnmh"
UA = {"User-Agent": "MapColombia-DH-project (data acquisition script)"}

# SIEVCAC modality codes appearing in dataset names
MODALITIES = ("MA", "AS", "AT", "AP", "AB", "DF", "DB", "MI", "RU", "SE", "VS")


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def catalog_search(query):
    results, offset = [], 0
    while True:
        url = f"{CATALOG}?domains={DOMAIN}&q={urllib.parse.quote(query)}&limit=100&offset={offset}"
        page = get_json(url).get("results", [])
        results.extend(page)
        if len(page) < 100:
            return results
        offset += 100


def classify(meta):
    """Return (family, kind, modality) or None if not a wanted SIEVCAC dataset."""
    name = meta.get("name") or ""
    desc = meta.get("description") or ""
    attr = meta.get("attribution") or ""
    if re.match(r"(?i)vista", name):
        return None  # VISTA_ duplicates
    if "Departamento" in name:
        return None  # departmental subset views
    kind = "casos" if re.search(r"(?i)\bcasos\b", name) else (
        "victimas" if re.search(r"(?i)v.ctimas", name) else None)
    if kind is None:
        return None
    m = re.search(r"\b(" + "|".join(MODALITIES) + r")\b", name)
    if not m:
        return None
    if meta.get("viewType") == "href":
        if "SIEVCAC" not in desc:
            return None
        return ("geoportal", kind, m.group(1))
    if "Memoria Histórica" in attr:
        return ("socrata", kind, m.group(1))
    return None


def geoportal_csv_url(meta):
    for ap in meta.get("metadata", {}).get("additionalAccessPoints", []):
        url = ap.get("urls", {}).get("text/csv")
        if url:
            return url
    return None


def download(url, dest, max_wait=300):
    """Download URL to dest. ArcGIS hub may answer 202 while generating the export."""
    start = time.time()
    while True:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=600) as r:
            if r.status == 202:  # export still generating
                if time.time() - start > max_wait:
                    raise TimeoutError(f"export not ready after {max_wait}s: {url}")
                time.sleep(10)
                continue
            dest.write_bytes(r.read())
            return


def sha256(path):
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def main():
    manifest = {"downloaded_at": datetime.now(timezone.utc).isoformat(), "datasets": []}
    seen = {}  # (family, kind, modality) -> id, to detect dupes

    ids = {r["resource"]["id"] for r in catalog_search("SIEVCAC")}
    print(f"catalog: {len(ids)} candidate datasets")

    for ds_id in sorted(ids):
        meta = get_json(f"{VIEWS}/{ds_id}.json")
        c = classify(meta)
        if not c:
            continue
        family, kind, modality = c
        key = (family, kind, modality)
        if key in seen:
            print(f"  DUPE {key}: {ds_id} vs {seen[key]} — keeping first, recording both")
            manifest["datasets"].append({"id": ds_id, "skipped_duplicate_of": seen[key],
                                         "name": meta.get("name")})
            continue
        seen[key] = ds_id

        if family == "socrata":
            url = f"{VIEWS}/{ds_id}/rows.csv?accessType=DOWNLOAD"
        else:
            url = geoportal_csv_url(meta)
            if not url:
                print(f"  WARN no CSV access point for {ds_id} ({meta.get('name')})")
                continue

        dest_dir = OUT / family
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{kind}_{modality}_{ds_id}.csv"
        print(f"  {family}/{kind}/{modality} <- {ds_id} ({meta.get('name', '')[:60]})")
        download(url, dest)

        lic = meta.get("license") or {}
        manifest["datasets"].append({
            "id": ds_id,
            "family": family,
            "kind": kind,
            "modality": modality,
            "name": meta.get("name"),
            "attribution": meta.get("attribution"),
            "description": (meta.get("description") or "")[:500],
            "license": lic.get("name"),
            "license_url": lic.get("termsLink"),
            "source_url": url,
            "file": str(dest.relative_to(OUT.parent.parent.parent)),
            "bytes": dest.stat().st_size,
            "sha256": sha256(dest),
        })

    (OUT / "manifest.json").parent.mkdir(parents=True, exist_ok=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                                       encoding="utf-8")
    n = sum(1 for d in manifest["datasets"] if "file" in d)
    print(f"done: {n} files -> {OUT}")


if __name__ == "__main__":
    main()
