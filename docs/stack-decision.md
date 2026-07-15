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
   (protomaps/PMTiles#584, #582, maintainer-reproduced). Target end state: app shell on
   Pages, `.pmtiles` + large data on Cloudflare R2 (free egress). Also avoids Pages' 100 GB/mo
   soft bandwidth cap.

   **Realized (2026-07-14): `deforestation_lossyear.pmtiles` is committed and served from
   Pages, not R2** — accepted deliberately to ship the deployed deforestation view without
   standing up R2. Known costs, eyes open:
   - The ~89 MB blob is **permanent in git history**; each rebuild commits another. Reclaiming
     it needs a `git filter-repo`/BFG rewrite (all SHAs change, force-push).
   - Still exposed to #584. Its failure mode is not a blank map but the *whole file* returned
     for a range request (symptom: "content-length exceeding request") — i.e. an ~89 MB
     download **and** a broken raster. If that shows up in the wild, moving to R2 is the fix;
     shrinking the pyramid is **not** (#584 hits sub-50 MB files, so size isn't the trigger).
   - Escape hatch is pre-built: set `VITE_TILES_BASE` to a range-reliable, CORS-enabled origin
     and only this file moves off Pages. Build-time config, no code change.
   - Rejected alternative: **GitHub Release assets** host it outside git history and do honor
     Range (verified 206), but send **no CORS headers** (verified) — unusable from the browser.
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
- **Dev basemap is CARTO dark-matter** — self-hosted PMTiles on R2 stays the production
  plan (the PMTiles-on-Pages bug is unchanged). ⚠ Legal note (2026-06-10): CARTO scopes
  free basemap use to "CARTO grantees" for non-commercial purposes and the governing
  T&Cs PDF (2024-05-23, linked from carto.com/basemaps) is not publicly readable —
  free-use eligibility for this site is UNVERIFIED. Attribution (© CARTO,
  © OpenStreetMap contributors) is required and surfaced by MapLibre's attribution
  control. **Do not ship CARTO tiles to production** without written confirmation;
  the PMTiles plan moots this (then attribute © OpenStreetMap contributors, ODbL,
  + Protomaps).
- **Violence ships as binary columnar buffers** (`violence.bin`, ~8 MB for 341,547
  events) consumed via deck.gl's binary-attributes path — pos f32 / day i32 / id u32 /
  year u16 / victims u16 / muni u16 / cat u8 / grp u8, modality-sorted so each modality
  layer is a zero-copy `subarray`. JSON at this scale would be ~20 MB.
- **MVP filters by YEAR (u16→f32), not day**: year-level slider; the days-since-1958
  encoding is already in the binary (`day`, −1 = unknown) for future day-resolution
  scrubbing, avoiding any date imputation for the ~7% of events with unknown month/day.
- Versions pinned by install: svelte 5.55, vite 8.0, maplibre-gl 5.24, deck.gl 9.3.3.

## Memoria view additions (2026-06-05)

- **Day-resolution time on the GPU**: the memoria tab animates continuous time by
  filtering on a SECOND filter-value array (days-since-1958 as f32) with the same
  `DataFilterExtension` — `filterRange`/`filterSoftRange` are per-frame uniform updates,
  zero re-upload. The soft range (30 days) + default `filterTransformSize/Color` give
  the wound fade/contract for free; the scar layer is a hard `[-0.5, t]` range over a
  separate appearance-day array (unknown-day events appear at Dec 31 of their year —
  display rule, the binary keeps −1).
- **Additive blending** on the wound-glow layer via luma.gl v9 parameter names
  (`blendColorOperation/SrcFactor/DstFactor`); the parameters object is hoisted to a
  constant — per-frame identity churn would register as a pipeline change.
- **Choropleth colour epoch**: per-muni LR blend recomputes on a 15-sim-day bucket
  (≈11×/s at default speed), not per frame; `updateTriggers.getFillColor` carries the
  epoch string. Polygon data identity stays constant so tessellation runs once.
- **LOAD-BEARING: `$state.raw` for loaded artifacts.** Deep `$state` proxies over the
  parsed JSON registered one Svelte signal per array element; with a `$derived` reading
  them, every per-frame `mday` write re-validated ~10⁵ dependencies (measured 3 fps,
  ~300 ms/frame inside Svelte `is_dirty`). `$state.raw` on the five loaded artifacts
  restored 68 fps. Any future loaded-data state must be `$state.raw`.
- **deck data identity under animation**: `electionPoints()` is memoized per election
  rec — `buildLayers()` now runs per animation frame, and any fresh `data` array forces
  a full attribute regen. Same rule as the violence binary objects, now load-bearing
  for every layer.
- Perf harness: `frontend/scripts/probe-fps.mjs` (headed Chrome; idle vs playing FPS +
  long tasks). Headless Playwright renders WebGL on SwiftShader — use it for console
  errors and layout, not for performance conclusions.

## Device-performance tiers (2026-06-11)

The memoria scene at full quality is ~6M tendril line instances + large additive
sprites at devicePixelRatio — seconds per frame on integrated/software GPUs.
`frontend/src/lib/perf.svelte.ts` defines three tiers (low/mid/high) that cap the
expensive display knobs; `?tier=` forces one, and demotions persist via
localStorage (`mdv:tier:v1`).

- **Tier selection**: GPU renderer string (WEBGL_debug_renderer_info) + cores/memory
  heuristics at startup, then a runtime FPS governor (rAF-delta median during memoria
  playback) demotes one tier at a time if frames stay >40 ms. Never promotes —
  flapping would rebuild the tendril fields repeatedly.
- **What tiers change** (display only, never data): tendril curve-pool caps (with a
  stroke-width compensation so the field stays legible), rendering resolution
  (deck `useDevicePixels` + maplibre `pixelRatio`/`setPixelRatio`), the additive
  glow layer (capped on mid, off on low — worst overdraw), pick depths, the
  stationary-cursor re-pick cadence during playback, and the panels'
  `backdrop-filter` blur (`:root.no-blur` fallback — blur over an animating canvas
  resamples every frame).
- **Playback tick cap**: TimeBar clamps each rAF advance to 100 ms of real time —
  below 10 fps sim time slows instead of silently lurching years per frame.
- Measured on SwiftShader (same build, `probe-lowend.mjs`): high 23 s/frame,
  low 6.2 s/frame, load 48 s → 11 s. Software GL stays unusable (not a target);
  the headed reference (RTX-class) holds 76 fps at every tier.

## Unverified / to confirm during build

- ~~DANE MGN exact download URL + license text~~ → verified 2026-06-05
  (`geoportal.dane.gov.co/descargas/mgn_2023/MGN2023_MPIO_POLITICO.zip`, open download,
  DANE attribution; see docs/data-sources.md).
- Colombia PMTiles extract size (`pmtiles extract --dry-run`).
- ~~Exact current deck.gl npm version~~ → 9.3.3 (verified 2026-06-05).
- DataFilterExtension composition with GPU aggregation layers (still untested — MVP uses
  ScatterplotLayer only).
