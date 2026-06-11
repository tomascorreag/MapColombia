# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Digital Humanities project: an interactive browser-based map of Colombia correlating two georeferenced, timestamped datasets:

1. **Violence events** — masacres and other violent events of the armed conflict.
2. **Election results** — Chamber, Senate, and Presidential results.

The artifact is a web page that displays both layers dynamically (map + time dimension) so spatial/temporal correlation between violence and electoral outcomes can be explored.

## Architecture

- **`pipeline/`** — Python (pandas/geopandas) for acquisition, cleaning, geocoding, and joining. Outputs clean GeoJSON/CSV consumed by the frontend. Raw downloads go in `data/raw/` (never hand-edited); processed outputs in `data/processed/`.
- **`frontend/`** — Svelte 5 (runes) + TypeScript + Vite; MapLibre GL JS v5 + deck.gl v9 via `MapboxOverlay` (direct, no wrapper lib); CARTO dark-matter basemap for dev (production plan: Protomaps PMTiles); D3 charts in Svelte components. Full rationale and **load-bearing constraints** (float32 time encoding, filterRange-only scrubbing, feature-state choropleths, no terrain) in `docs/stack-decision.md` — read it before touching map code.
- **Hosting** — app shell on GitHub Pages; `.pmtiles` + large data on Cloudflare R2 (GitHub Pages range-request bug with PMTiles, protomaps/PMTiles#584).

## Build & run

- Pipeline: `python pipeline/build_frontend_data.py` → `data/processed/frontend/` (violence.bin binary columnar + violence_details.bin gi-aligned per-event victim portrait, lazy-loaded by the click panel + elections.json + munis.json + munis_shapes.json + memoria.json). Requires raw data (see Data sources) and `geopandas pyogrio shapely>=2.1` for the polygon step.
- Frontend: `cd frontend && npm run dev` (predev hook copies `data/processed/frontend/` → `public/data/`; that copy is gitignored — the canonical artifact is in `data/processed/`).
- Checks: `npm run check` (svelte-check + tsc), `npm run build`; visual smoke test `node scripts/smoke.mjs` against a dev server on :5199 (Playwright); perf probe `node scripts/probe-fps.mjs` (headed — headless WebGL is software-rendered).
- The Memoria tab's left–right scores come from the curated, cited table `pipeline/party_lr.py` — scholarly interpretation, flagged for owner review; the per-row citation is the contract. Never add a score without one.

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
- Gotchas: CNMH `Anio_hecho=0` = unknown date (65% of RU casos) — null, never impute; post-1991 Senate files are national-circunscription (0.3–2M rows, candidate × municipio).

Geographic join key: Colombian municipalities use **DIVIPOLA codes** (DANE). Prefer joining on DIVIPOLA code, never on municipality name (names are ambiguous/duplicated across departments).

## Language

- Site UI and public-facing content: bilingual Spanish/English.
- Code, comments, commit messages, repo docs: English.
