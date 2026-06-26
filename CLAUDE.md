# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Digital Humanities project: an interactive browser-based map of Colombia correlating two georeferenced, timestamped datasets:

1. **Violence events** — masacres and other violent events of the armed conflict.
2. **Election results** — Chamber, Senate, and Presidential results.

The artifact is a web page that displays both layers dynamically (map + time dimension) so spatial/temporal correlation between violence and electoral outcomes can be explored.

A third, **experimental deforestation view** ships alongside, gated behind a URL flag (`?section=deforestation`) — a year-scrubbed pixel raster of forest-cover loss. It reuses the same map shell and time-scrubber but is otherwise self-contained (see **Deforestation view** below).

## Architecture

- **`pipeline/`** — Python (pandas/geopandas) for acquisition, cleaning, geocoding, and joining. Outputs clean GeoJSON/CSV consumed by the frontend. Raw downloads go in `data/raw/` (never hand-edited); processed outputs in `data/processed/`.
- **`frontend/`** — Svelte 5 (runes) + TypeScript + Vite; MapLibre GL JS v5 + deck.gl v9 via `MapboxOverlay` (direct, no wrapper lib); CARTO dark-matter basemap for dev (production plan: Protomaps PMTiles); D3 charts in Svelte components. Full rationale and **load-bearing constraints** (float32 time encoding, filterRange-only scrubbing, feature-state choropleths, no terrain) in `docs/stack-decision.md` — read it before touching map code.
- **Hosting** — app shell on GitHub Pages; `.pmtiles` + large data on Cloudflare R2 (GitHub Pages range-request bug with PMTiles, protomaps/PMTiles#584).

## Build & run

- Pipeline: `python pipeline/build_frontend_data.py` → `data/processed/frontend/` (violence.bin binary columnar + violence_details.bin gi-aligned per-event victim portrait, lazy-loaded by the click panel + elections.json + munis.json + munis_shapes.json + memoria.json). Requires raw data (see Data sources) and `geopandas pyogrio shapely>=2.1` for the polygon step.
- Frontend: `cd frontend && npm run dev` (predev hook copies `data/processed/frontend/` → `public/data/`; that copy is gitignored — the canonical artifact is in `data/processed/`).
- Checks: `npm run check` (svelte-check + tsc), `npm run build`; visual smoke test `node scripts/smoke.mjs` against a dev server on :5199 (Playwright); perf probe `node scripts/probe-fps.mjs` (headed — headless WebGL is software-rendered).
- The Memoria tab's left–right scores come from the curated, cited table `pipeline/party_lr.py` — scholarly interpretation, flagged for owner review; the per-row citation is the contract. Never add a score without one.
- Deforestation pipeline (separate from the main build): download steps (all no-auth) `python pipeline/download_hansen.py` (Hansen GFC-2025-v1.13 `lossyear` tiles → `data/raw/hansen/`), `download_treecover.py` (Hansen `treecover2000` canopy-% tiles, same no-auth bucket/tiles — feeds the jungle-green forest backdrop), `download_drivers.py` (WRI driver raster), and the Phase 2 attribution sources `download_corine.py` (IDEAM CORINE 2022 ag/pasture polygons, REST GeoJSON), `download_coca.py` (UNODC SIMCI coca density), `download_ica_bovino.py` (ICA cattle census `.aspx` Excel), `download_boundaries.py` (RUNAP + Ley 2ª legality layers, REST GeoJSON). Then `python pipeline/build_deforestation.py` → `data/processed/frontend/deforestation_lossyear.png` (R=year/G=density/B=packed codes) + `deforestation_forest.png` (R=year-2000 canopy %, A=country mask — backdrop) + `deforestation.json`. Requires `rasterio numpy pillow xlrd openpyxl` and the already-built `munis.json`/`munis_shapes.json`. Curated headline figures + per-row citations (IDEAM totals, WRI drivers, CORINE ag-kinds, SIMCI coca, ICA cattle, RUNAP/Ley2 legality) live in `pipeline/deforestation_meta_curated.py` — owner-review-flagged, same contract as `party_lr.py`. Phase 2 spec/realized notes: `frontend/DEFORESTATION_PHASE2_PLAN.md`.

## Deforestation view

Experimental third view, additive to the violence/elections code (a third `app.tab` value, `'deforestation'`). Activated only by `?section=deforestation` in the URL — read once at startup in `App.svelte` (no router; works on GH Pages project sites where a path would 404). Plain `/` is unchanged.

- **Render** — Hansen tree-cover-loss as a GPU-thresholded **pixel raster**, not a choropleth. `frontend/src/lib/LossRasterLayer.ts` is a custom `BitmapLayer` subclass binding **one** texture `deforestation_lossyear.png`: R=earliest loss year, G=loss density, **B=PACKED codes** (bits 0-2 WRI driver, 3-4 ag-kind, 5-6 legality, 7 coca-present), A=mask. All four attribution codes are bit-packed into B because a **second BitmapLayer sampler fails luma's `_areTexturesRenderable` and silently skips the whole draw** (empty map, no console error) — packing keeps the proven single-texture path; **nearest filtering is mandatory** so the packed byte isn't interpolated. A std140 uniform (`maxYear = defPos - 2000`) discards pixels above the scrubbed year and G-density drives opacity (honesty fix — a naive build painted near-all of Colombia amber). A unified `defSpot` selector (`spotDim`/`spotCode` uniforms) spotlights one code from any dimension (driver/kind/legality/coca) by unpacking B with GLSL integer bit-ops. Scrubbing reuses the texture; no re-upload. The `smoke-deforestation.mjs` gate samples canvas pixels — a console-error-only check misses a blank-map regression. Beneath the loss raster, `ForestLayer.ts` (sibling `BitmapLayer` subclass) renders a **jungle-green forest backdrop** from `deforestation_forest.png` (R=year-2000 canopy %, A=country mask): canopy drives green depth, a 2-octave value-noise mottles foliage, alpha clips to the country. It is a **separate layer with its own single texture** — fine, since the luma second-sampler limit is per-layer, not global. Look knobs live in `forestDebug.svelte.ts` (own `?debug` panel, anchored left); treecover2000 is a year-2000 snapshot, visualization-only.
- **Panels** — `LegendDeforestation.svelte` (annual-loss meter + a **3-way lens toggle Agricultura | Legalidad | Motores**, each a ranked-by-year hoverable list driving the spotlight) and `DeforestationReadout.svelte` (per-municipio click readout incl. its ICA cattle inventory). Year scrubber + histogram in `TimeBar.svelte` (`'deforestation'` branch; state `defPos` float scrub, `defYear` derived, `defMuni`, `defSpot`).
- **Integrity** — per-municipio hectares counted from native 30 m pixels (lat-corrected), joined on DANE code; display PNGs downsampled, labeled visualization-only. Hansen ≠ IDEAM deforestation — labeled. **Phase 2 attributions are independent, each caveated**: ag-kind = CORINE *subsequent land cover* (proxy for use, not the agent; "pasture cover ≠ ranching"; 25 ha MMU); coca = SIMCI *monitored area*, presence-correlation not coca-driven; cattle = ICA *vaccination-cycle inventory*, correlation not cause; legality = **zonal not adjudicated** (inside a park = use not permitted there, not a verdict), single-vintage boundaries labeled. IDEAM ranking stays a "estimated ordering, not official shares" disclaimer — never fabricated percentages.

## Data integrity (non-negotiable)

This project records real victims and real elections.

- Every event record must carry a source citation (dataset + ID or URL).
- Never fabricate, estimate, or interpolate coordinates, dates, victim counts, or vote counts. If a value is missing, leave it null and flag it.
- Pipeline transformations must be reproducible scripts, not manual edits to processed files.

## Data sources

Vetted source research + empirical audit live in `docs/data-sources.md` (read it before any pipeline work). Raw data (2.1 GB) is already downloaded via `pipeline/download_cnmh.py` and `pipeline/download_cede.py` (manifests with checksums in `data/raw/*/manifest.json`); re-run those scripts to re-fetch. Summary:
- Violence: CNMH SIEVCAC (primary; 11 modalities, event-level, DANE codes + complete coordinates; two cuts — 2024-09-30 CC BY-SA 4.0 licensed, 2026-03-31 current but license unstated), UCDP GED (1989–2024, names only + coords, 93% municipality-precision or better). ACLED rejected (2018+ only, restrictive EULA).
- Elections: CEDE Resultados Electorales (CC0; camara/senado/presidencia, **municipio-level, candidate-level, every election 1958–2022**, `codmpio` DANE keys + legacy crosswalk).
- Joint window at municipio level: **1958–present** (audit-verified; the earlier "~1993" research estimate was wrong). **Decision (2026-06-05): display window is 1958–present.**
- Deforestation: Hansen Global Forest Change **GFC-2025-v1.13** `lossyear` (30 m annual tree-cover loss, 2001–2025; render + per-municipio stats) + curated IDEAM national figures (official deforestation authority). Scoping research and realized-MVP notes in `docs/data-sources-deforestation.md`. Window: **2001–2025**.
- Gotchas: CNMH `Anio_hecho=0` = unknown date (65% of RU casos) — null, never impute; post-1991 Senate files are national-circunscription (0.3–2M rows, candidate × municipio).

Geographic join key: Colombian municipalities use **DIVIPOLA codes** (DANE). Prefer joining on DIVIPOLA code, never on municipality name (names are ambiguous/duplicated across departments).

## Language

- Site UI and public-facing content: bilingual Spanish/English.
- Code, comments, commit messages, repo docs: English.
