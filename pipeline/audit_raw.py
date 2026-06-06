"""Audit raw downloads: municipio coverage, join keys, year ranges.

Checks (read-only, no mutation of raw data):
  1. CEDE electoral: per year/body — rows, distinct codmpio, null codmpio, vote totals.
     Detects partial municipal coverage in early years.
  2. CNMH SIEVCAC (geoportal cut): per modality — rows, year range, DANE-code and
     coordinate completeness.

Usage: python pipeline/audit_raw.py
"""

import glob
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"


def audit_cede_electoral():
    print("=== CEDE electoral (.tab) ===")
    print(f"{'year':<6}{'body':<28}{'rows':>8}{'mpios':>7}{'null_mpio':>10}{'votes':>15}")
    for path in sorted(glob.glob(str(RAW / "cede" / "electoral" / "*.tab"))):
        name = Path(path).name
        m = re.match(r"(\d{4})_(\w+)\.tab", name)
        if not m:
            continue
        df = pd.read_csv(path, sep="\t", low_memory=False,
                         usecols=lambda c: c in ("codmpio", "votos"))
        nmun = df["codmpio"].nunique() if "codmpio" in df else -1
        nullm = int(df["codmpio"].isna().sum()) if "codmpio" in df else -1
        votes = int(pd.to_numeric(df["votos"], errors="coerce").sum()) if "votos" in df else -1
        print(f"{m.group(1):<6}{m.group(2):<28}{len(df):>8}{nmun:>7}{nullm:>10}{votes:>15,}")


def audit_cnmh():
    print()
    print("=== CNMH SIEVCAC geoportal casos ===")
    print(f"{'modality':<10}{'rows':>8}{'yr_min':>8}{'yr_max':>8}{'yr0':>6}{'null_dane':>10}{'null_lat':>9}")
    for path in sorted(glob.glob(str(RAW / "cnmh" / "geoportal" / "casos_*.csv"))):
        name = Path(path).name
        modality = name.split("_")[1]
        df = pd.read_csv(path, low_memory=False)
        ycol = "Anio_hecho"
        yr = pd.to_numeric(df[ycol], errors="coerce")
        real = yr[yr > 0]
        print(f"{modality:<10}{len(df):>8}{int(real.min()):>8}{int(real.max()):>8}"
              f"{int((yr <= 0).sum()):>6}{int(df['Geo_municipio'].isna().sum()):>10}"
              f"{int(df['Latitud'].isna().sum()):>9}")


if __name__ == "__main__":
    audit_cede_electoral()
    audit_cnmh()
