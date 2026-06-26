"""Build a Web-Mercator raster tile PYRAMID of Hansen tree-cover loss as PMTiles.

Output (data/processed/frontend/):
  - deforestation_lossyear.pmtiles : an XYZ/slippy lossless-WebP pyramid (zoom
    Z_MIN..Z_MAX) in EPSG:3857. Each 256x256 tile uses the SAME RGBA packing as the
    legacy single-texture deforestation_lossyear.png (WebP is lossless -> the
    categorical channels are bit-exact; ~2.3x smaller than PNG on this sparse data):
      R = earliest loss-year code (1..25 = 2001..2025; 0 = no loss)
      G = loss density (0..255)  -> drives display opacity
      B = PACKED codes: bits 0-2 WRI driver, 3-4 ag-kind, 5-6 legality, 7 coca-present
      A = 255 where loss, else 0
    The frontend loads it through deck.gl TileLayer; only viewport tiles at the
    matching zoom are on the GPU, so the finest level reaches ~native 30 m
    (z12 ~= 38 m/px) without a giant single texture.

Why a custom tiler (not gdal2tiles / rio-tiler): the R and B channels are
CATEGORICAL (loss year, packed codes) and MUST NOT be interpolated. Overviews are
built bottom-up with categorical-safe aggregation — R = earliest year of the 4
children, B = packed codes of that earliest child, A = mask — while G (density) is
the MEAN of the 4 children so opacity is conserved across LOD (no brightness pop
when a coarse tile sharpens; also keeps the zoomed-out view honest — scattered loss
reads faint, never solid amber). Nearest filtering on the GPU completes the contract.

Finest level (Z_MAX): each native 30 m loss pixel is placed into its web-mercator
display pixel; a lit display pixel = presence (G=255) so individual clearing reads
solid when zoomed in. Loss is masked to Colombia via the coarse muni grid (DANE),
identical to the legacy build. Per-municipio / national hectare stats are NOT
produced here — those stay in build_deforestation.py, counted from native pixels.

Reuses constants + loaders from build_deforestation.py (same dir, importable):
  parse_tile, load_muni_labels, load_driver_grid, load_agkind_grid, load_coca_grid,
  load_boundary_masks, and WEST/SOUTH/EAST/NORTH/NATIVE_DEG/FACTOR/COLS/ROWS/STRIP/RAW/OUT.

Requires: rasterio numpy pillow pmtiles, the raw Hansen lossyear tiles
(pipeline/download_hansen.py), and the already-built munis.json / munis_shapes.json
plus the Phase-2 raw attribution layers (same inputs as build_deforestation.py).

Usage: python pipeline/build_deforestation_tiles.py
"""

import io
import json
import math
from datetime import datetime, timezone

import numpy as np
import rasterio
from rasterio.windows import Window
from PIL import Image
from pmtiles.writer import Writer
from pmtiles.tile import Compression, TileType, zxy_to_tileid

import build_deforestation as bd

Z_MAX = 12          # finest level: ~38 m/px at the equator (near-native 30 m)
Z_MIN = 5           # coarse overview floor (covers the national view + fallback)
TILE = 256          # tile edge in px
NTILES_MAX = 1 << Z_MAX     # tiles per axis at the finest level (4096)


def lonlat_to_global_px(lon, lat):
    """Vectorised lon/lat (deg) -> global web-mercator pixel coords at Z_MAX.
    Standard slippy formula; returns float arrays (floor later)."""
    span = NTILES_MAX * TILE
    x = (lon + 180.0) / 360.0 * span
    lat_rad = np.radians(lat)
    y = (1.0 - np.arcsinh(np.tan(lat_rad)) / math.pi) / 2.0 * span
    return x, y


def collect_loss_pixels(packed_cell_flat, muni_lab_flat):
    """Pass 1: stream native Hansen lossyear windows, keep every in-Colombia loss
    pixel as (global px x, global px y at Z_MAX, year code, packed code).
    packed_cell_flat / muni_lab_flat are the coarse (ROWS x COLS) grids, sampled
    per native pixel via its coarse cell (row//FACTOR, col//FACTOR)."""
    manifest = json.loads((bd.RAW / "manifest.json").read_text(encoding="utf-8"))
    gx_parts, gy_parts, yr_parts, pk_parts = [], [], [], []
    for f in manifest["files"]:
        tile = f["tile"]
        lon_nw, lat_nw = bd.parse_tile(tile)
        path = bd.RAW / f"Hansen_{manifest['version']}_lossyear_{tile}.tif"
        col_off = round((lon_nw - bd.WEST) / bd.NATIVE_DEG)
        row_off = round((bd.NORTH - lat_nw) / bd.NATIVE_DEG)
        with rasterio.open(path) as ds:
            W, H = ds.width, ds.height
            for r0 in range(0, H, bd.STRIP):
                h = min(bd.STRIP, H - r0)
                arr = ds.read(1, window=Window(0, r0, W, h))
                rr, cc = np.nonzero(arr)
                if rr.size == 0:
                    continue
                yr = arr[rr, cc].astype(np.uint8)             # 1..25
                row_g = rr.astype(np.int64) + (r0 + row_off)
                col_g = cc.astype(np.int64) + col_off
                # coarse cell -> Colombia mask + packed attribution code
                rc = row_g // bd.FACTOR
                ccoarse = col_g // bd.FACTOR
                inside = (rc >= 0) & (rc < bd.ROWS) & (ccoarse >= 0) & (ccoarse < bd.COLS)
                if not inside.any():
                    continue
                row_g, col_g, yr = row_g[inside], col_g[inside], yr[inside]
                cell = (row_g // bd.FACTOR) * bd.COLS + (col_g // bd.FACTOR)
                in_col = muni_lab_flat[cell] >= 0
                if not in_col.any():
                    continue
                cell, yr = cell[in_col], yr[in_col]
                row_g, col_g = row_g[in_col], col_g[in_col]
                lon = bd.WEST + (col_g + 0.5) * bd.NATIVE_DEG
                lat = bd.NORTH - (row_g + 0.5) * bd.NATIVE_DEG
                fx, fy = lonlat_to_global_px(lon, lat)
                gx_parts.append(np.floor(fx).astype(np.int32))
                gy_parts.append(np.floor(fy).astype(np.int32))
                yr_parts.append(yr)
                pk_parts.append(packed_cell_flat[cell])
        print(f"  scanned tile {tile}")
    gx = np.concatenate(gx_parts)
    gy = np.concatenate(gy_parts)
    yr = np.concatenate(yr_parts)
    pk = np.concatenate(pk_parts)
    print(f"loss pixels in Colombia: {gx.size:,}")
    return gx, gy, yr, pk


def encode_tile(rgba):
    """Encode a 256x256x4 tile as LOSSLESS WebP. ~2.3x smaller than PNG on this
    sparse categorical raster (measured 0.43x), and lossless = bit-exact, so the
    categorical R (year) / B (packed codes) channels are preserved (the integrity
    contract). method=4 matches method=6 within 0.5% but is ~200x faster to encode.
    The frontend decodes via createImageBitmap(Blob), which sniffs the format from
    magic bytes — no client change needed when switching PNG -> WebP."""
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="WEBP", lossless=True,
                                       quality=100, method=4)
    return buf.getvalue()


def build_finest(gx, gy, yr, pk):
    """Group loss pixels into Z_MAX tiles; return {(z,x,y): png_bytes}.
    Per display pixel: R = earliest year, B = packed of that earliest pixel,
    G = A = 255 (presence). Overviews average G down for honesty."""
    tx = (gx >> 8).astype(np.int64)
    ty = (gy >> 8).astype(np.int64)
    within = ((gy & 255) * TILE + (gx & 255)).astype(np.int64)   # 0..65535
    tid = ty * NTILES_MAX + tx
    order = np.argsort(tid, kind="stable")
    tid, within, yr, pk = tid[order], within[order], yr[order], pk[order]
    tx, ty = tx[order], ty[order]
    uniq, starts = np.unique(tid, return_index=True)
    ends = np.append(starts[1:], tid.size)
    tiles = {}
    for u, s, e in zip(uniq, starts, ends):
        w = within[s:e]
        y = yr[s:e]
        p = pk[s:e]
        # earliest year wins: assign in descending-year order so the min lands last
        o = np.argsort(-y, kind="stable")
        year = np.zeros(TILE * TILE, dtype=np.uint8)
        packed = np.zeros(TILE * TILE, dtype=np.uint8)
        year[w[o]] = y[o]
        packed[w[o]] = p[o]
        mask = (year > 0).astype(np.uint8) * 255
        rgba = np.zeros((TILE * TILE, 4), dtype=np.uint8)
        rgba[:, 0] = year
        rgba[:, 1] = mask                     # finest density = presence
        rgba[:, 2] = packed
        rgba[:, 3] = mask
        rgba = rgba.reshape(TILE, TILE, 4)
        xt = int(u % NTILES_MAX)
        yt = int(u // NTILES_MAX)
        tiles[(Z_MAX, xt, yt)] = encode_tile(rgba)
    print(f"finest level z{Z_MAX}: {len(tiles):,} tiles")
    return tiles


def downsample_parent(children):
    """children: dict quadrant (qx,qy in {0,1}) -> 256x256x4 uint8 (missing = absent).
    Return the 256x256x4 parent: categorical-safe R/B (earliest child), density G as
    the conserving MEAN over the 2x2 block, A = mask."""
    canvas = np.zeros((2 * TILE, 2 * TILE, 4), dtype=np.uint8)
    for (qx, qy), arr in children.items():
        canvas[qy * TILE:(qy + 1) * TILE, qx * TILE:(qx + 1) * TILE] = arr
    # reshape into 2x2 blocks -> (256,256,4 subcells, 4 channels)
    b = canvas.reshape(TILE, 2, TILE, 2, 4).transpose(0, 2, 1, 3, 4).reshape(TILE, TILE, 4, 4)
    lit = b[..., 3] > 0                                   # (256,256,4) alpha per subcell
    any_lit = lit.any(axis=2)
    yr = b[..., 0].astype(np.int16)
    yr_for_min = np.where(lit, yr, 99)                    # 99 > max year code
    pick = np.argmin(yr_for_min, axis=2)                  # subcell with earliest year
    ii, jj = np.indices((TILE, TILE))
    out = np.zeros((TILE, TILE, 4), dtype=np.uint8)
    out[..., 0] = np.where(any_lit, b[ii, jj, pick, 0], 0)            # earliest year
    out[..., 1] = np.round(b[..., 1].mean(axis=2)).astype(np.uint8)   # density = mean
    out[..., 2] = np.where(any_lit, b[ii, jj, pick, 2], 0)            # packed of earliest
    out[..., 3] = np.where(any_lit, 255, 0).astype(np.uint8)
    return out


def build_overviews(tiles):
    """Build z = Z_MAX-1 .. Z_MIN from the level below, in place into `tiles`."""
    for z in range(Z_MAX - 1, Z_MIN - 1, -1):
        # group child tiles by parent
        groups = {}
        for (cz, cx, cy), png in tiles.items():
            if cz != z + 1:
                continue
            parent = (z, cx >> 1, cy >> 1)
            groups.setdefault(parent, {})[(cx & 1, cy & 1)] = png
        for parent, kids in groups.items():
            decoded = {q: np.asarray(Image.open(io.BytesIO(png)).convert("RGBA"))
                       for q, png in kids.items()}
            tiles[parent] = encode_tile(downsample_parent(decoded))
        print(f"overview z{z}: {len(groups):,} tiles")


def write_pmtiles(tiles, out_path):
    e7 = 10_000_000
    with open(out_path, "wb") as f:
        w = Writer(f)
        for (z, x, y) in sorted(tiles, key=lambda k: zxy_to_tileid(*k)):
            w.write_tile(zxy_to_tileid(z, x, y), tiles[(z, x, y)])
        header = {
            "tile_type": TileType.WEBP,
            "tile_compression": Compression.NONE,   # WebP already compressed
            "min_lon_e7": int(bd.WEST * e7),
            "min_lat_e7": int(bd.SOUTH * e7),
            "max_lon_e7": int(bd.EAST * e7),
            "max_lat_e7": int(bd.NORTH * e7),
            "center_zoom": 7,
            "center_lon_e7": int((bd.WEST + bd.EAST) / 2 * e7),
            "center_lat_e7": int((bd.SOUTH + bd.NORTH) / 2 * e7),
        }
        metadata = {
            "name": "Hansen tree-cover loss (Colombia) — display pyramid",
            "description": ("Web-mercator lossless-WebP pyramid. R=earliest loss year (1..25), "
                            "G=loss density, B=packed driver/ag-kind/legality/coca codes, "
                            "A=mask. Nearest filtering required. Visualization-only; "
                            "per-municipio hectares are counted from native 30 m pixels "
                            "(see deforestation.json). Hansen loss != IDEAM deforestation."),
            "attribution": "Hansen/UMD/Google/USGS/NASA — Global Forest Change GFC-2025-v1.13",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        w.finalize(header, metadata)
    size_mb = out_path.stat().st_size / 1e6
    print(f"{out_path.name}: {len(tiles):,} tiles, {size_mb:.1f} MB "
          f"(z{Z_MIN}..z{Z_MAX})")


def main():
    print(f"pyramid z{Z_MIN}..z{Z_MAX}; finest ~{156543.03 / (1 << Z_MAX):.1f} m/px @ equator")
    muni_lab, _ = bd.load_muni_labels()
    muni_lab_flat = muni_lab.reshape(-1)

    # coarse attribution grids -> a single packed-code grid, sampled per loss pixel.
    # Mirrors build_deforestation.write_png's B-channel packing exactly.
    drv = bd.load_driver_grid().reshape(-1).astype(np.uint16)
    agk = bd.load_agkind_grid().reshape(-1).astype(np.uint16)
    coca_first, _ = bd.load_coca_grid()
    coca = (coca_first.reshape(-1) > 0).astype(np.uint16)
    leg = bd.load_boundary_masks(muni_lab).reshape(-1).astype(np.uint16)
    packed_cell_flat = ((drv & 7) | ((agk & 3) << 3) | ((leg & 3) << 5)
                        | ((coca & 1) << 7)).astype(np.uint8)
    print("coarse attribution grids loaded; packing per-pixel codes")

    gx, gy, yr, pk = collect_loss_pixels(packed_cell_flat, muni_lab_flat)
    tiles = build_finest(gx, gy, yr, pk)
    del gx, gy, yr, pk
    build_overviews(tiles)
    write_pmtiles(tiles, bd.OUT / "deforestation_lossyear.pmtiles")


if __name__ == "__main__":
    main()
