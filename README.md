# MapColombia

An interactive, browser-based map of Colombia for exploring the spatial and temporal
correlation between the armed conflict and electoral politics — and, in an experimental
view, forest-cover loss. A Digital Humanities project: every record is real and carries a
source citation; nothing is fabricated, estimated, or interpolated.

## Views

The app is a single map shell with a time dimension. Which dataset it shows depends on the
active tab (and, for deforestation, a URL flag):

| View | How to reach it | What it shows |
|------|-----------------|---------------|
| **Memoria / Violence** | default | Masacres and other violent events of the armed conflict (CNMH SIEVCAC + UCDP GED), point layer over time. |
| **Elections** | tab switch | Chamber, Senate, and Presidential results (CEDE), municipio choropleth. |
| **Deforestation** | `?section=deforestation` | Year-scrubbed pixel raster of forest-cover loss (Hansen GFC). Experimental. |

Joint violence/elections window is **1958–present** at municipio level. Geographic joins use
**DIVIPOLA / DANE codes**, never municipality names.

## The deforestation view (`?section=deforestation`)

Append `?section=deforestation` to the URL (e.g. `http://localhost:5173/?section=deforestation`,
or `…/MapColombia/?section=deforestation` in production). The flag is read once at startup; no
router and no separate path (a path would 404 on the GitHub Pages project site). Plain `/` shows
the unchanged violence view.

What it renders:

- **Pixel raster of tree-cover loss** — Hansen Global Forest Change `lossyear` (30 m, annual),
  drawn as a GPU-thresholded BitmapLayer. The year slider scrubs 2001–2025; loss appears
  cumulatively up to the selected year. Loss-pixel density drives opacity, so isolated stray loss
  stays faint rather than flooding the map.
- **National loss meter** — annual hectares lost plus **Pérdida acumulada** (running total through
  the scrubbed year), with curated IDEAM official figures cited alongside.
- **Causes** — a ranked list of deforestation drivers with a clear *"estimated ordering — not
  official IDEAM shares"* disclaimer. Causes are **not** given fabricated percentages.
- **Per-municipio readout** — click a municipality for its per-year loss (counted from native 30 m
  pixels, latitude-corrected, joined on DANE code) and the source citation.

**Honesty caveats, surfaced in the UI:** Hansen *tree-cover loss* ≠ IDEAM *deforestation*
(different definitions — Hansen includes plantations/fire/natural loss); the display raster is
downsampled for visualization while per-municipio hectares come from full-resolution stats. See
`docs/data-sources-deforestation.md` for the full scoping and the realized-MVP notes.

## Build & run

```bash
# Pipeline (Python) — violence + elections artifacts
python pipeline/build_frontend_data.py

# Deforestation artifacts (separate; needs rasterio numpy pillow)
python pipeline/download_hansen.py        # Hansen GFC-2025-v1.13 lossyear tiles → data/raw/hansen/
python pipeline/build_deforestation.py    # → deforestation_lossyear.png + deforestation.json

# Frontend (Svelte 5 + Vite); predev hook syncs data/processed/frontend/ → public/data/
cd frontend
npm install
npm run dev        # http://localhost:5173  (add ?section=deforestation for the loss view)
npm run check      # svelte-check + tsc
npm run build
```

## Layout

- `pipeline/` — Python (pandas / geopandas / rasterio) acquisition, cleaning, joining. Raw
  downloads in `data/raw/` (never hand-edited); processed outputs in `data/processed/`.
- `frontend/` — Svelte 5 (runes) + TypeScript + Vite; MapLibre GL v5 + deck.gl v9 via
  `MapboxOverlay`; D3 charts. See `docs/stack-decision.md` for load-bearing constraints.
- `docs/` — source research and audits (`data-sources.md`, `data-sources-deforestation.md`,
  `stack-decision.md`).
- `CLAUDE.md` — contributor/agent guidance, including the data-integrity rules.

## Data integrity (non-negotiable)

This project records real victims, real elections, and real forest loss. Every record carries a
source citation; missing values are left null and flagged, never imputed; all pipeline
transformations are reproducible scripts, not manual edits to processed files. Curated
interpretive tables (`pipeline/party_lr.py`, `pipeline/deforestation_meta_curated.py`) require a
per-row citation and are flagged for owner review.

## Language

Site UI and public-facing content are bilingual Spanish/English. Code, comments, commits, and repo
docs are in English.
