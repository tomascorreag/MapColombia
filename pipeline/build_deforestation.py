"""Build the deforestation frontend artifacts from Hansen lossyear tiles.

Outputs (data/processed/frontend/):
  - deforestation_lossyear.png : display raster. Coarse cells over Colombia; the
    RED channel encodes the EARLIEST loss year present in the cell (1..24 =
    2001..2024, 0 = no loss), alpha 0 where no loss. Reprojected to EPSG:3857 so a
    deck.gl BitmapLayer (which maps the texture linearly in web-mercator) aligns.
    A custom shader thresholds by the scrubbed year.
  - deforestation.json : meta (bounds, sources, licenses, the Hansen-vs-IDEAM
    caveat, downsample note), per-municipio annual loss (ha, lat-corrected, joined
    on DANE via munis_shapes properties.i — never on name), national annual totals,
    plus the curated IDEAM figures + ranked causes (deforestation_meta_curated).

Method / integrity:
  - Loss area is COUNTED from native 30 m pixels (sparse-scatter histogram per
    municipio x year), not read off the downsampled display raster. Per-pixel area
    is latitude-corrected (cos lat).
  - The DISPLAY raster is downsampled (FACTOR below) from native 30 m — stated in
    meta; it is for visualization only.
  - Hansen tree-cover loss != IDEAM deforestation (different definitions); labeled.

Requires: data/raw/hansen/*.tif (pipeline/download_hansen.py) and
data/processed/frontend/{munis.json,munis_shapes.json} (build_frontend_data.py).

Usage: python pipeline/build_deforestation.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform_bounds
from rasterio.windows import Window
from PIL import Image

import deforestation_meta_curated as cur

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "hansen"
RAW_DRV = ROOT / "data" / "raw" / "drivers"
RAW_CORINE = ROOT / "data" / "raw" / "corine"
RAW_COCA = ROOT / "data" / "raw" / "coca"
RAW_ICA = ROOT / "data" / "raw" / "ica"
RAW_BND = ROOT / "data" / "raw" / "boundaries"
OUT = ROOT / "data" / "processed" / "frontend"
N_DRIVERS = 7                         # WRI/GDM dominant-driver classes 1..7

# Phase 2a "kind of agriculture": subsequent land cover of cleared land.
# CORINE level-2 groups -> our 3 ag-kind codes (0 = none / non-agricultural):
#   1 Pasto (ganaderia)  = nivel_2 '23'   (231/232/233 limpios/arbolados/enmalezados)
#   2 Cultivos           = nivel_2 '21','22' (transitorios / permanentes)
#   3 Mosaico agropec.   = nivel_2 '24'   (areas agricolas heterogeneas)
N_AGKIND = 3
CORINE_N2_TO_KIND = {"21": 2, "22": 2, "23": 1, "24": 3}
N_COCA_YEARS = 23                     # SIMCI areacoca columns 2001..2023

# Phase 2b LEGALITY: was clearing permitted at that location? Priority codes
# (highest restriction wins): 1 protected (RUNAP) > 2 forest reserve (Ley 2ª) >
# 3 other (in-country, no special restriction). ZONAL, not adjudicated.
N_LEGALITY = 3

# Colombia bbox in integer degrees — aligns to the 1-degree Hansen tile corners
# and to the 4000 px/deg native grid. (Excludes San Andres/Malpelo islands;
# negligible forest, noted in meta.)
WEST, SOUTH, EAST, NORTH = -80, -5, -66, 14
NATIVE_DEG = 0.00025                  # Hansen pixel size (4000 px/deg)
FACTOR = 25                           # native px per coarse cell -> ~0.00625 deg (~695 m)
CELL_DEG = NATIVE_DEG * FACTOR
COLS = round((EAST - WEST) / CELL_DEG)      # 2240
ROWS = round((NORTH - SOUTH) / CELL_DEG)    # 3040
STRIP = 2000                          # native rows per windowed read (div. by FACTOR)
N_LOSS_YEARS = 25                     # lossyear 1..25 == 2001..2025 (GFC-2025-v1.13)
YEAR0 = 2000                          # lossyear v -> calendar YEAR0 + v


def parse_tile(name: str):
    """'20N_080W' -> (lon_nw, lat_nw) of the tile's NW corner."""
    lat_s, lon_s = name.split("_")
    lat = int(lat_s[:-1]) * (1 if lat_s[-1] == "N" else -1)
    lon = int(lon_s[:-1]) * (1 if lon_s[-1] == "E" else -1)
    return lon, lat


def load_driver_grid():
    """Reproject the WRI/GDM dominant-driver classification onto the coarse grid.

    Returns a ROWSxCOLS uint8 array of driver codes (1..7; 0 = unclassified). The
    driver is location-fixed at 1 km, so sampling onto our ~695 m cells (nearest)
    is exact-enough — each cell sits well inside a single 1 km driver cell.
    """
    manifest = json.loads((RAW_DRV / "manifest.json").read_text(encoding="utf-8"))
    path = RAW_DRV / Path(manifest["files"][0]["file"]).name
    dst = np.zeros((ROWS, COLS), dtype=np.uint8)
    dst_transform = from_origin(WEST, NORTH, CELL_DEG, CELL_DEG)
    with rasterio.open(path) as ds:
        # window the global raster to Colombia in the dataset's own CRS, then warp
        left, bottom, right, top = transform_bounds(
            "EPSG:4326", ds.crs, WEST, SOUTH, EAST, NORTH)
        win = ds.window(left, bottom, right, top).round_offsets().round_lengths()
        src = ds.read(1, window=win)
        src_transform = ds.window_transform(win)
        reproject(source=src, destination=dst,
                  src_transform=src_transform, src_crs=ds.crs,
                  dst_transform=dst_transform, dst_crs="EPSG:4326",
                  resampling=Resampling.nearest)
    dst[dst > N_DRIVERS] = 0                 # source nodata (255) -> 0 = unclassified
    return dst


def load_muni_labels():
    """Rasterize munis_shapes polygons onto the coarse equirectangular grid.
    Returns (label_grid int32 ROWSxCOLS with -1 outside, n_muni)."""
    munis = json.loads((OUT / "munis.json").read_text(encoding="utf-8"))
    n_muni = len(munis["codes"])
    shapes_fc = json.loads((OUT / "munis_shapes.json").read_text(encoding="utf-8"))
    geoms = [(f["geometry"], f["properties"]["i"])
             for f in shapes_fc["features"] if f["properties"]["i"] is not None]
    transform = from_origin(WEST, NORTH, CELL_DEG, CELL_DEG)
    lab = rasterize(geoms, out_shape=(ROWS, COLS), transform=transform,
                    fill=-1, dtype="int32", all_touched=False)
    return lab, n_muni


def load_agkind_grid():
    """Rasterize CORINE 2022 ag polygons onto the coarse grid -> per-cell ag-kind
    code (1 Pasto, 2 Cultivos, 3 Mosaico; 0 none). Geometry is already EPSG:4326
    (requested outSR), matching the build grid. Land cover is a partition so burn
    order rarely matters; we still burn Pasto last so it wins any edge ties (the
    cattle-ranching signal is the headline)."""
    fc = json.loads((RAW_CORINE / "corine_2022_ag.geojson").read_text(encoding="utf-8"))
    geoms = []
    for f in fc["features"]:
        n2 = (f.get("properties") or {}).get("nivel_2")
        kind = CORINE_N2_TO_KIND.get(str(n2))
        if kind and f.get("geometry"):
            geoms.append((f["geometry"], kind))
    geoms.sort(key=lambda g: {1: 2, 2: 0, 3: 1}[g[1]])   # Pasto(1) burned last
    transform = from_origin(WEST, NORTH, CELL_DEG, CELL_DEG)
    grid = rasterize(geoms, out_shape=(ROWS, COLS), transform=transform,
                     fill=0, dtype="uint8", all_touched=False)
    return grid


# SIMCI per-year coca-area field names are NOT regex-uniform (verified from the
# Socrata schema): three break the areacoca_YYYY pattern.
def _coca_year_fields():
    fields = {}
    for y in range(2001, 2024):
        fields[y] = f"areacoca_{y}"
    fields[2004] = "areacoca2004"
    fields[2022] = "coca2022_"
    fields[2023] = "areacoca2023"
    return fields                       # year -> property name


def load_coca_grid():
    """Rasterize SIMCI coca onto the coarse grid as the EARLIEST coca year per cell
    (index 1..23 = 2001..2023; 0 = never). Cheap uint8 scalar that the shader/loss
    loop can threshold by the scrubbed year, keeping coca TIME-VARYING. Also returns
    the national monitored-coca-area series (cited SIMCI statistic, not loss-derived)."""
    fc = json.loads((RAW_COCA / "coca_density.geojson").read_text(encoding="utf-8"))
    yf = _coca_year_fields()
    area_by_year = [0.0] * N_COCA_YEARS
    burn = []                           # (geometry, earliest_year_idx)
    for f in fc["features"]:
        props = f.get("properties") or {}
        geom = f.get("geometry")
        if not geom:
            continue
        earliest = 0
        for y in range(2001, 2024):
            v = props.get(yf[y])
            try:
                a = float(v)
            except (TypeError, ValueError):
                a = 0.0
            if a > 0:
                area_by_year[y - 2001] += a
                if earliest == 0:
                    earliest = y - 2000          # 1..23
        if earliest:
            burn.append((geom, earliest))
    # burn EARLIEST years last so REPLACE leaves the per-cell minimum (first detection)
    burn.sort(key=lambda g: -g[1])
    transform = from_origin(WEST, NORTH, CELL_DEG, CELL_DEG)
    coca_first = rasterize(burn, out_shape=(ROWS, COLS), transform=transform,
                           fill=0, dtype="uint8", all_touched=False)
    return coca_first, [round(x, 1) for x in area_by_year]


def load_cattle():
    """Per-municipio cattle head count from the ICA censo (2022 xlsx + 2023 xls).
    Drops the sheet's grand-total row (rows without a valid 5-digit DANE code), so
    totals match ICA's published national figure. Returns {dane_code: {year: head}}."""
    import openpyxl
    import xlrd

    def valid_dane(s):
        s = str(s).strip()
        return s if (len(s) == 5 and s.isdigit()) else None

    out = {}                            # dane -> {year: head}

    sh = xlrd.open_workbook(RAW_ICA / "ica_bovino_2023.xls").sheet_by_name("BOVINOS Y PREDIOS")
    hdr = [str(sh.cell_value(4, c)).strip() for c in range(sh.ncols)]
    ci = hdr.index([h for h in hdr if "CODIGO MUNICIPIO" in h][0])
    ti = hdr.index([h for h in hdr if "TOTAL BOVINOS" in h][0])
    for r in range(5, sh.nrows):
        dane = valid_dane(sh.cell_value(r, ci))
        v = sh.cell_value(r, ti)
        if dane and isinstance(v, (int, float)):
            out.setdefault(dane, {})[2023] = int(v)

    ws = openpyxl.load_workbook(RAW_ICA / "ica_bovino_2022.xlsx",
                                read_only=True, data_only=True)["BOVINOS Y PREDIOS"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(x).strip() if x is not None else "" for x in rows[4]]
    ci = hdr.index([h for h in hdr if "CODIGO MUNICIPIO" in h][0])
    ti = hdr.index([h for h in hdr if "TOTAL BOVINOS" in h][0])
    for row in rows[5:]:
        dane = valid_dane(row[ci]) if ci < len(row) else None
        v = row[ti] if ti < len(row) else None
        if dane and isinstance(v, (int, float)):
            out.setdefault(dane, {})[2022] = int(v)

    return out


def load_boundary_masks(muni_lab):
    """Rasterize RUNAP + Ley 2ª polygons onto the coarse grid and resolve a per-cell
    legality code: 1 protected (RUNAP) > 2 forest reserve (Ley 2ª) > 3 other
    (in-country, no special restriction); 0 outside Colombia. GeoJSON is EPSG:4326
    (requested outSR), matching the build grid."""
    transform = from_origin(WEST, NORTH, CELL_DEG, CELL_DEG)

    def mask(fname):
        fc = json.loads((RAW_BND / fname).read_text(encoding="utf-8"))
        geoms = [(f["geometry"], 1) for f in fc["features"] if f.get("geometry")]
        return rasterize(geoms, out_shape=(ROWS, COLS), transform=transform,
                         fill=0, dtype="uint8", all_touched=False)

    runap = mask("runap.geojson")
    ley2 = mask("ley2.geojson")
    leg = np.where(muni_lab >= 0, 3, 0).astype(np.uint8)   # in-country default
    leg[ley2 > 0] = 2
    leg[runap > 0] = 1                                      # protected wins
    return leg


def main():
    manifest = json.loads((RAW / "manifest.json").read_text(encoding="utf-8"))
    tiles = [f["tile"] for f in manifest["files"]]

    print(f"grid: {COLS} x {ROWS} cells @ {CELL_DEG:.5f} deg (~{CELL_DEG*111320:.0f} m)")
    muni_lab, n_muni = load_muni_labels()
    muni_lab_flat = muni_lab.reshape(-1)
    in_col = (muni_lab_flat >= 0).sum()
    print(f"munis: {n_muni}; coarse cells inside Colombia: {in_col}")

    drv_cell = load_driver_grid()                          # ROWS x COLS, driver 1..7 (0 = none)
    drv_cell_flat = drv_cell.reshape(-1)
    print(f"driver grid: {(drv_cell_flat > 0).sum()} classified cells "
          f"({N_DRIVERS} WRI/GDM classes)")

    agkind_cell = load_agkind_grid()                       # ROWS x COLS, 1 pasto/2 cult/3 mosaico
    agkind_cell_flat = agkind_cell.reshape(-1)
    print(f"ag-kind grid (CORINE 2022): "
          f"pasto={int((agkind_cell_flat==1).sum())} cultivos={int((agkind_cell_flat==2).sum())} "
          f"mosaico={int((agkind_cell_flat==3).sum())} cells")
    coca_first, coca_area_by_year = load_coca_grid()       # earliest coca year per cell
    coca_first_flat = coca_first.reshape(-1)
    print(f"coca grid (SIMCI): {int((coca_first_flat>0).sum())} cells ever coca; "
          f"national monitored area 2023 = {coca_area_by_year[-1]:,.0f} ha")
    legality_cell = load_boundary_masks(muni_lab)          # 1 protected/2 reserve/3 other
    legality_flat = legality_cell.reshape(-1)
    print(f"legality grid: protected={int((legality_flat==1).sum())} "
          f"reserve={int((legality_flat==2).sum())} other={int((legality_flat==3).sum())} cells")

    # latitude-corrected native-pixel area (ha) per coarse row
    row_lat = NORTH - (np.arange(ROWS) + 0.5) * CELL_DEG
    px_lon_m = NATIVE_DEG * 111320.0 * np.cos(np.deg2rad(row_lat))
    px_lat_m = NATIVE_DEG * 110540.0
    area_ha_row = (px_lon_m * px_lat_m) / 1e4          # ha per native pixel, per row

    disp_flat = np.full(ROWS * COLS, 255, dtype=np.uint8)   # 255 = unset (earliest year)
    count_flat = np.zeros(ROWS * COLS, dtype=np.int32)      # loss 30 m pixels per cell
    muni_ha_flat = np.zeros(n_muni * N_LOSS_YEARS, dtype=np.float64)
    driver_ha = np.zeros(N_DRIVERS * N_LOSS_YEARS, dtype=np.float64)  # (driver, year) ha
    agkind_ha = np.zeros(N_AGKIND * N_LOSS_YEARS, dtype=np.float64)   # (ag-kind, year) ha
    coca_loss_ha = np.zeros(N_LOSS_YEARS, dtype=np.float64)           # loss in coca-by-then cells
    legality_ha = np.zeros(N_LEGALITY * N_LOSS_YEARS, dtype=np.float64)  # (legality, year) ha

    for tile in tiles:
        lon_nw, lat_nw = parse_tile(tile)
        path = RAW / f"Hansen_{manifest['version']}_lossyear_{tile}.tif"
        col_off_native = round((lon_nw - WEST) / NATIVE_DEG)
        row_off_native = round((NORTH - lat_nw) / NATIVE_DEG)
        with rasterio.open(path) as ds:
            W, H = ds.width, ds.height
            for r0 in range(0, H, STRIP):
                h = min(STRIP, H - r0)
                g0 = r0 + row_off_native
                if g0 + h <= 0 or g0 >= ROWS * FACTOR:
                    continue                                # strip fully outside bbox
                arr = ds.read(1, window=Window(0, r0, W, h))
                rr, cc = np.nonzero(arr)
                if rr.size == 0:
                    continue
                yr = arr[rr, cc]                            # 1..24
                gr = (rr + g0) // FACTOR
                gc = (cc + col_off_native) // FACTOR
                ok = (gr >= 0) & (gr < ROWS) & (gc >= 0) & (gc < COLS)
                if not ok.any():
                    continue
                gr, gc, yr = gr[ok], gc[ok], yr[ok]
                cell = gr * COLS + gc
                muni = muni_lab_flat[cell]
                m_ok = muni >= 0
                if not m_ok.any():
                    continue
                cm, ym, grm = cell[m_ok], yr[m_ok], gr[m_ok]
                # display: earliest loss year per cell + loss-pixel density (Colombia only)
                np.minimum.at(disp_flat, cm, ym)
                count_flat += np.bincount(cm, minlength=count_flat.size)
                # area: lat-corrected ha into (muni, year-1) via fast bincount
                flat = muni[m_ok] * N_LOSS_YEARS + (ym - 1)
                w = area_ha_row[grm]
                muni_ha_flat += np.bincount(flat, weights=w,
                                            minlength=n_muni * N_LOSS_YEARS)
                # causes: ha into (driver-1, year-1). The driver is the loss cell's
                # 1 km dominant class — time-invariant; the YEAR axis is Hansen's.
                dv = drv_cell_flat[cm]
                dok = (dv >= 1) & (dv <= N_DRIVERS)
                if dok.any():
                    dflat = (dv[dok] - 1) * N_LOSS_YEARS + (ym[dok] - 1)
                    driver_ha += np.bincount(dflat, weights=w[dok],
                                             minlength=N_DRIVERS * N_LOSS_YEARS)
                # ag-kind: subsequent land cover (CORINE 2022) of the cleared cell.
                # Time-invariant cover x Hansen year axis (same shape as drivers).
                ak = agkind_cell_flat[cm]
                aok = (ak >= 1) & (ak <= N_AGKIND)
                if aok.any():
                    aflat = (ak[aok] - 1) * N_LOSS_YEARS + (ym[aok] - 1)
                    agkind_ha += np.bincount(aflat, weights=w[aok],
                                             minlength=N_AGKIND * N_LOSS_YEARS)
                # coca: attribute loss in year y to coca iff coca was first detected
                # in that cell by year y (coca_first <= ym). Keeps coca time-varying.
                cf = coca_first_flat[cm]
                cok = (cf >= 1) & (cf <= ym)
                if cok.any():
                    coca_loss_ha += np.bincount(ym[cok] - 1, weights=w[cok],
                                                minlength=N_LOSS_YEARS)
                # legality: zonal class of the cleared cell x Hansen year.
                lg = legality_flat[cm]
                lok = (lg >= 1) & (lg <= N_LEGALITY)
                if lok.any():
                    lflat = (lg[lok] - 1) * N_LOSS_YEARS + (ym[lok] - 1)
                    legality_ha += np.bincount(lflat, weights=w[lok],
                                               minlength=N_LEGALITY * N_LOSS_YEARS)
        print(f"  processed tile {tile}")

    disp = disp_flat.reshape(ROWS, COLS)
    disp[disp == 255] = 0                                   # unset -> no loss
    # loss density per cell: fraction of the cell's 30 m pixels that were lost.
    # Drives display OPACITY so a single stray loss pixel is nearly invisible and
    # only concentrated clearing reads as solid — otherwise 24 years of scattered
    # loss paints almost the whole country and overstates the extent.
    frac = (count_flat.reshape(ROWS, COLS) / float(FACTOR * FACTOR))
    frac255 = np.clip(frac * 255.0, 0, 255).astype(np.uint8)
    muni_ha = muni_ha_flat.reshape(n_muni, N_LOSS_YEARS)
    national = muni_ha.sum(axis=0)
    national_by_driver = driver_ha.reshape(N_DRIVERS, N_LOSS_YEARS)
    national_by_agkind = agkind_ha.reshape(N_AGKIND, N_LOSS_YEARS)
    attributed = national_by_driver.sum()
    print(f"national tree-cover loss (Hansen): total {national.sum():,.0f} ha; "
          f"{YEAR0 + N_LOSS_YEARS} = {national[-1]:,.0f} ha "
          f"(cf. IDEAM deforestation 2024 = 113,608 ha — different definition)")
    print(f"driver-attributed loss: {attributed:,.0f} ha "
          f"({100 * attributed / max(1.0, national.sum()):.1f}% of national)")
    ak_tot = national_by_agkind.sum()
    print(f"ag-kind-attributed loss (CORINE cover): {ak_tot:,.0f} ha "
          f"({100 * ak_tot / max(1.0, national.sum()):.1f}% of national) — "
          f"pasto {national_by_agkind[0].sum():,.0f}, cultivos {national_by_agkind[1].sum():,.0f}, "
          f"mosaico {national_by_agkind[2].sum():,.0f}")
    print(f"loss in coca-by-then cells: {coca_loss_ha.sum():,.0f} ha")
    national_by_legality = legality_ha.reshape(N_LEGALITY, N_LOSS_YEARS)
    print(f"legality-attributed loss: protected {national_by_legality[0].sum():,.0f}, "
          f"reserve {national_by_legality[1].sum():,.0f}, other {national_by_legality[2].sum():,.0f} ha")

    cattle = load_cattle()
    print(f"cattle (ICA): {len(cattle)} munis; 2023 national = "
          f"{sum(d.get(2023, 0) for d in cattle.values()):,} head")

    write_png(disp, frac255, drv_cell, agkind_cell, coca_first, legality_cell)
    write_json(muni_ha, national, national_by_driver, national_by_agkind,
               coca_loss_ha, coca_area_by_year, cattle, national_by_legality)


def _to_3857(src, dst_transform, dw, dh):
    src_transform = from_origin(WEST, NORTH, CELL_DEG, CELL_DEG)
    dst = np.zeros((dh, dw), dtype=np.uint8)
    reproject(source=src, destination=dst,
              src_transform=src_transform, src_crs="EPSG:4326",
              dst_transform=dst_transform, dst_crs="EPSG:3857",
              resampling=Resampling.nearest)
    return dst


def write_png(disp, frac255, drv_cell, agkind_cell, coca_first, legality_cell):
    """Two grid-aligned EPSG:3857 RGBA textures (same bounds/size; sampled together
    by LossRasterLayer):
      deforestation_lossyear.png  R=earliest loss-year, G=loss density, B=driver, A=mask
      deforestation_codes.png     R=ag-kind (1..3), G=legality (phase 2b; 0 now),
                                  B=earliest coca year (1..23; 0 none), A=mask"""
    dst_transform, dw, dh = calculate_default_transform(
        "EPSG:4326", "EPSG:3857", COLS, ROWS, WEST, SOUTH, EAST, NORTH)
    dst_year = _to_3857(disp, dst_transform, dw, dh)
    mask = np.where(dst_year > 0, 255, 0).astype(np.uint8)

    rgba = np.zeros((dh, dw, 4), dtype=np.uint8)
    rgba[..., 0] = dst_year                                 # red   = year code
    rgba[..., 1] = _to_3857(frac255, dst_transform, dw, dh)  # green = loss density
    rgba[..., 2] = _to_3857(drv_cell, dst_transform, dw, dh)  # blue  = driver code
    rgba[..., 3] = mask
    p = OUT / "deforestation_lossyear.png"
    Image.fromarray(rgba, "RGBA").save(p, optimize=True)
    print(f"deforestation_lossyear.png: {dw} x {dh} px, {p.stat().st_size/1e6:.2f} MB")

    codes = np.zeros((dh, dw, 4), dtype=np.uint8)
    codes[..., 0] = _to_3857(agkind_cell, dst_transform, dw, dh)  # red   = ag-kind 1..3
    codes[..., 1] = _to_3857(legality_cell, dst_transform, dw, dh)  # green = legality 1..3
    codes[..., 2] = _to_3857(coca_first, dst_transform, dw, dh)   # blue  = coca first year
    codes[..., 3] = mask                                    # same loss mask as main
    pc = OUT / "deforestation_codes.png"
    Image.fromarray(codes, "RGBA").save(pc, optimize=True)
    print(f"deforestation_codes.png: {dw} x {dh} px, {pc.stat().st_size/1e6:.2f} MB")


def write_json(muni_ha, national, national_by_driver, national_by_agkind,
               coca_loss_ha, coca_area_by_year, cattle, national_by_legality):
    years = [YEAR0 + 1 + i for i in range(N_LOSS_YEARS)]   # 2001..2025
    totals = muni_ha.sum(axis=1)
    keep = np.nonzero(totals > 0)[0]
    m = [int(i) for i in keep]
    loss = [[round(float(x), 1) for x in muni_ha[i]] for i in keep]
    # causes: per-driver national annual loss (ha). Index 0 of each list = years[0].
    loss_by_driver = {
        str(d["code"]): [round(float(x), 1) for x in national_by_driver[d["code"] - 1]]
        for d in cur.DRIVERS
    }
    # kind-of-agriculture (CORINE subsequent cover): per-kind national annual loss ha.
    loss_by_agkind = {
        str(k["code"]): [round(float(x), 1) for x in national_by_agkind[k["code"] - 1]]
        for k in cur.AG_KINDS
    }
    # coca: loss attributed to coca-by-then cells (per loss year), plus the cited
    # SIMCI national monitored-coca-AREA series (2001..2023; pad to the loss years).
    coca_loss_by_year = [round(float(x), 1) for x in coca_loss_ha]
    coca_area = list(coca_area_by_year) + [None] * (N_LOSS_YEARS - N_COCA_YEARS)
    # legality: per-class national annual loss ha (1 protected, 2 reserve, 3 other).
    loss_by_legality = {
        str(c["code"]): [round(float(x), 1) for x in national_by_legality[c["code"] - 1]]
        for c in cur.LEGALITY_CLASSES
    }
    # cattle: ICA head count per municipio index (DANE -> muni index via munis.json).
    munis = json.loads((OUT / "munis.json").read_text(encoding="utf-8"))
    code_to_idx = {int(c): i for i, c in enumerate(munis["codes"])}
    cattle_by_muni = {}
    for dane, by_year in cattle.items():
        idx = code_to_idx.get(int(dane))
        if idx is not None:
            cattle_by_muni[str(idx)] = {str(y): v for y, v in sorted(by_year.items())}

    out = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "render_source": {
                "name": "Hansen Global Forest Change lossyear",
                "version": "GFC-2025-v1.13",
                "citation": ("Hansen, M. C., et al. (2013), Science 342:850-853; "
                             "Global Forest Change GFC-2025-v1.13 (2001–2025)."),
                "license_note": "Freely available with citation.",
            },
            "definition_caveat": (
                "Hansen tree-cover LOSS includes plantations, fire and natural loss "
                "and is NOT the same as IDEAM deforestation (permanent natural-forest "
                "conversion). The two national series differ by definition."),
            "join": "per-municipio loss joined on DANE code via munis_shapes properties.i",
            "display_raster": {
                "file": "deforestation_lossyear.png",
                "encoding": ("red = earliest loss year code (1..25); green = loss density "
                             "(fraction of cell's 30 m pixels lost, 0..255); blue = dominant "
                             "driver code (1..7, 0 = none); alpha 0 = no loss. "
                             "Display opacity follows density so a stray pixel is near-invisible; "
                             "appearance year = the cell's EARLIEST loss (intensity reflects total "
                             "loss, a documented approximation vs per-year density)"),
                "year_map": "calendar_year = 2000 + code",
                "bounds_lnglat": [WEST, SOUTH, EAST, NORTH],
                "crs": "EPSG:3857 (web mercator)",
                "downsample_note": (f"downsampled from native 30 m to ~{CELL_DEG*111320:.0f} m "
                                    "cells for display only; per-municipio areas are counted "
                                    "from native 30 m pixels, not from this raster"),
                "excludes": "San Andres/Providencia/Malpelo islands (outside bbox)",
            },
            "area_method": ("native 30 m loss pixels counted per municipio x year, "
                            "latitude-corrected (cos lat); hectares"),
            "ideam_caveat": cur.ATTRIBUTION_NOTE,
            "drivers_source": {
                "name": "WRI/Google DeepMind Global Drivers of Forest Loss (1 km)",
                "citation": cur.DRIVERS[0]["source"],
                "license": "CC BY 4.0",
                "caveat": cur.DRIVERS_CAVEAT,
            },
            "codes_raster": {
                "file": "deforestation_codes.png",
                "encoding": ("companion texture, same grid/bounds as the lossyear PNG. "
                             "red = ag-kind (1 pasto, 2 cultivos, 3 mosaico; 0 none); "
                             "green = legality (phase 2b; 0 for now); blue = earliest coca "
                             "year (1..23 = 2001..2023; 0 none); alpha = same loss mask."),
            },
            "agkind_source": {
                "name": "IDEAM CORINE Land Cover Colombia (national 1:100k, 2022)",
                "citation": cur.AG_KINDS[0]["source"],
                "license_note": "IDEAM open-data framework; explicit license UNVERIFIED.",
                "caveat": cur.AGKIND_CAVEAT,
            },
            "coca_source": {
                "name": "UNODC SIMCI monitored coca density (1 km, annual 2001-2023)",
                "citation": cur.COCA_SOURCE,
                "license": "CC BY-SA 4.0",
                "caveat": cur.COCA_CAVEAT,
            },
            "cattle_source": {
                "name": "ICA Censo Nacional Bovino (per-municipio)",
                "citation": cur.CATTLE_SOURCE,
                "license_note": "No explicit open license on ICA pages; UNVERIFIED.",
                "caveat": cur.CATTLE_CAVEAT,
                "years": [2022, 2023],
            },
            "legality_source": {
                "name": "RUNAP protected areas + Reserva Forestal de Ley 2ª de 1959",
                "citation": cur.LEGALITY_SOURCE,
                "caveat": cur.LEGALITY_CAVEAT,
            },
            "pending_owner_review": True,
        },
        "years": years,
        "m": m,
        "loss": loss,
        "national": [round(float(x), 1) for x in national],
        "ideam_national": cur.IDEAM_NATIONAL,
        "causes": cur.CAUSES,
        "drivers": [{"code": d["code"], "label_es": d["label_es"],
                     "label_en": d["label_en"]} for d in cur.DRIVERS],
        "loss_by_driver": loss_by_driver,
        "agkinds": [{"code": k["code"], "label_es": k["label_es"],
                     "label_en": k["label_en"]} for k in cur.AG_KINDS],
        "loss_by_agkind": loss_by_agkind,
        "coca_loss_by_year": coca_loss_by_year,
        "coca_area_by_year": coca_area,
        "cattle": cattle_by_muni,
        "legality_classes": [{"code": c["code"], "label_es": c["label_es"],
                              "label_en": c["label_en"]} for c in cur.LEGALITY_CLASSES],
        "loss_by_legality": loss_by_legality,
    }
    p = OUT / "deforestation.json"
    p.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                 encoding="utf-8")
    print(f"deforestation.json: {len(m)} munis with loss, {p.stat().st_size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
