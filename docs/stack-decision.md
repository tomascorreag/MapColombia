# Frontend Stack Decision — 2026-06-05

> Verified via three parallel research streams (rendering, geo-delivery, app framework),
> sources cited inline in the research; current versions checked against npm/GitHub/docs
> as of 2026-06-05. Decision drivers: responsiveness ("as responsive as possible"),
> visual quality ("fancy graphics"), static hosting, open licensing, 1958–present time
> scrubbing over ~370k event points + ~1,120-municipality choropleths.

## The stack

| Layer | Choice | Version line | License |
|---|---|---|---|
| Basemap engine | MapLibre GL JS | v5 (WebGL2, ESM) | BSD-3 |
| GPU data layers | deck.gl via `MapboxOverlay` (overlaid mode) | v9.3+ | MIT |
| Basemap tiles | Protomaps PMTiles, Colombia extract | spec v3, `pmtiles` npm 4.x | tiles ODbL (© OpenStreetMap), style CC0 |
| Boundaries | DANE MGN 2024 municipios → mapshaper → TopoJSON | mapshaper 0.7.x | DANE terms TBC; geoBoundaries CC BY 4.0 fallback |
| UI framework | Svelte 5 (runes) | — | MIT |
| Map↔Svelte glue | MIERUNE svelte-maplibre-gl + `@svelte-maplibre-gl/deckgl` | v2 (May 2026) | MIT |
| Charts | D3 v7 inside Svelte components (+ LayerChart for standard types) | — | ISC/MIT |
| Build | Vite | v8 | MIT |
| Language | TypeScript | — | — |
| i18n ES/EN | Paraglide JS or hand-rolled dictionary | — | — |
| Hosting | GitHub Pages (app shell) + Cloudflare R2 (PMTiles + data) | — | — |

## Why (decision-driving findings)

1. **Time scrubbing must be GPU-side.** deck.gl `DataFilterExtension` filters on the GPU;
   updating `filterRange` per animation frame does not re-upload buffers. deck.gl's perf
   guide: 60fps to ~1M points (we render ≤370k). MapLibre-native alternative (`setFilter`
   per tick on a large GeoJSON source) is the documented slow path (re-tile/re-render;
   maplibre issues #4364, #6633). This single requirement eliminates every non-deck.gl option.
2. **Choropleth needs no tiling.** 1,120 polygons is ~50× below MapLibre's ~50k-feature
   vector-tile crossover. Single simplified TopoJSON (~0.5–2 MB), `promoteId: MPIO_CDPMP`,
   year/body switches via `setFeatureState` loop (the intended rapid-update mechanism;
   `setData` re-tessellates and is wrong for this).
3. **Static hosting works — with one trap.** PMTiles needs only HTTP range requests, but
   GitHub Pages has documented intermittent range-request failures with PMTiles
   (protomaps/PMTiles#584, #582, maintainer-reproduced). Therefore: app shell on Pages,
   `.pmtiles` + large data on Cloudflare R2 (free egress). Also avoids Pages' 100 GB/mo
   soft bandwidth cap.
4. **Svelte 5 over React.** Signal-based fine-grained reactivity — no virtual-DOM diff on
   each scrub tick fanning out to map + timeline + charts; smallest bundle; genre precedent
   (The Pudding: Svelte + D3). deck.gl is framework-independent (`@deck.gl/core` standalone),
   so React's binding ecosystem isn't load-bearing. React remains the rational pick if
   maintainer-continuity ever dominates; revisit only then.
5. **Mapbox GL JS v2+ is proprietary** (since 2020-12). MapLibre is the open fork. Not used.

## Load-bearing implementation constraints (violating these breaks the design)

- **Float32 time encoding**: deck.gl filter values are 32-bit floats. Encode event time as
  **days since 1958-01-01** (~25k max, integer-exact), never epoch seconds (precision loss
  over a 68-year span).
- **Drive the scrubber by mutating `filterRange`** in a rAF loop. Never `setData`/`setFilter`
  per tick. Use `filterSoftRange` for fade-in/out transitions.
- **Keep point radii modest** — overdraw (radius² fragments) is the perf killer, not count.
- **Keep the map 2D** — MapLibre feature-state stalls with terrain enabled (#6231).
- **mapshaper with `keep-shapes`** so San Andrés and small municipios survive simplification.
- **DataFilterExtension × aggregation layers (Heatmap/Hexagon) is UNVERIFIED** — test before
  promising time-filtered heatmaps; fallback is CPU-filter on aggregation toggle (not per tick).
- Historical municipalities: remap `codmpio_anti` → modern `codmpio` (CEDE crosswalk) and
  render on modern MGN polygons. Municipality-not-yet-created years = no-data, never zero.
  No per-year historical boundary geometry exists for Colombia (verified absence).

## MVP build deviations (2026-06-05)

- **Direct deck.gl integration** instead of MIERUNE svelte-maplibre-gl: one map view
  doesn't justify the wrapper dependency; `MapboxOverlay` + a single `$effect` is ~30
  lines (`frontend/src/lib/MapView.svelte`). Revisit if the map/UI surface grows.
- **Dev basemap is CARTO dark-matter** (free with attribution) — self-hosted PMTiles on
  R2 stays the production plan (the PMTiles-on-Pages bug is unchanged).
- **Violence ships as binary columnar buffers** (`violence.bin`, ~8 MB for 341,547
  events) consumed via deck.gl's binary-attributes path — pos f32 / day i32 / id u32 /
  year u16 / victims u16 / muni u16 / cat u8 / grp u8, modality-sorted so each modality
  layer is a zero-copy `subarray`. JSON at this scale would be ~20 MB.
- **MVP filters by YEAR (u16→f32), not day**: year-level slider; the days-since-1958
  encoding is already in the binary (`day`, −1 = unknown) for future day-resolution
  scrubbing, avoiding any date imputation for the ~7% of events with unknown month/day.
- Versions pinned by install: svelte 5.55, vite 8.0, maplibre-gl 5.24, deck.gl 9.3.3.

## Unverified / to confirm during build

- DANE MGN exact download URL + license text (geoportal pages 404'd during research).
- Colombia PMTiles extract size (`pmtiles extract --dry-run`).
- ~~Exact current deck.gl npm version~~ → 9.3.3 (verified 2026-06-05).
- DataFilterExtension composition with GPU aggregation layers (still untested — MVP uses
  ScatterplotLayer only).
