# Deforestation Phase 2 — Kind-of-agriculture + Legality overlay

> **STATUS 2026-06-24 — SHIPPED & VERIFIED (smoke green, npm run check clean).**
> Realized sources differ from the original draft (audits forced it — see the Phase 2a
> REVISION block below). What shipped:
> - **2a kind:** CORINE Land Cover 2022 → per-cell **Pasto / Cultivos / Mosaico** (`download_corine.py`);
>   SIMCI coca per-year earliest-detection (`download_coca.py`); ICA cattle per-municipio
>   (`download_ica_bovino.py`). Headline: pasture is the dominant subsequent cover of cleared
>   forest (1.99M ha vs 0.27M ha crops). Cattle shown in the muni readout (San José del Guaviare
>   230,888→234,866 head 2022→23).
> - **2b legality:** RUNAP protected areas + Ley 2ª forest reserves (`download_boundaries.py`) →
>   per-cell zonal legality. Headline: **482,015 ha** loss inside protected areas, **1,645,739 ha**
>   inside Ley 2ª reserves. **UPRA frontera (465k features, broken TLS) and resguardos DEFERRED.**
> - **Frontend:** companion `deforestation_codes.png` (R=ag-kind, G=legality, B=coca year) bound as
>   a 2nd sampler in `LossRasterLayer`; unified `defSpot` spotlight (spotDim/spotCode); 3-way lens
>   toggle (Agricultura | Legalidad | Motores) in `LegendDeforestation`. MapBiomas path abandoned.

**Goal:** refine the "causes" of the deforestation view beyond the shipped WRI driver layer (which
collapses ~89 % of Colombian loss into one bucket, "permanent agriculture"). Two phases:

- **Phase 2a — KIND of agriculture:** split agricultural loss into pasture / cropland / coca (the
  IDEAM #1 *praderización-ganadería* vs #3 *cultivos de uso ilícito* distinction the WRI taxonomy
  loses). Per-year breakdown + map spotlight on hover.
- **Phase 2b — LEGALITY:** classify loss by whether clearing was *permitted at that location* —
  inside protected areas / forest reserves, or outside the official agricultural frontier. Per-year
  breakdown + map spotlight on hover.

Full source scoping (verified 2026-06-24) lives in `docs/data-sources-deforestation.md` →
"KIND of agriculture + LEGALITY — Colombia-specific overlay". Read it; this plan is the build spec.

---

## Current state (what already ships — do not rebuild)

The view is gated behind `?section=deforestation`. Phase 1 (Hansen render) + the WRI driver layer are
**done and verified** (smoke-deforestation.mjs passes: 7 driver rows, hover spotlight, 98.4 % driver
coverage, no console errors).

**Pipeline (`pipeline/`):**
- `download_hansen.py` → Hansen GFC-2025-v1.13 lossyear tiles → `data/raw/hansen/` (6 tiles, 300 MB).
- `download_drivers.py` → WRI/GDM 1 km driver raster (`classification` band, codes 1..7) →
  `data/raw/drivers/drivers_forest_loss_1km_2001_2023_v1_1.tif` (290 MB, CC BY 4.0). nodata=255.
- `build_deforestation.py` → reads Hansen strips, sparse-scatters loss into per-cell earliest-year +
  density, per-(muni,year) ha, and per-(driver,year) ha. Reprojects driver class onto the coarse grid
  (`load_driver_grid()`), attributes each loss cell's driver. Coarse grid: `WEST,SOUTH,EAST,NORTH =
  -80,-5,-66,14`, `CELL_DEG=0.00625` (~695 m), `COLS=2240`, `ROWS=3040`, `N_LOSS_YEARS=25`
  (2001..2025), `N_DRIVERS=7`. Joins on DANE via `munis_shapes properties.i`.
- `deforestation_meta_curated.py` → curated cited tables: `IDEAM_NATIONAL`, `CAUSES` (IDEAM ranked,
  qualitative), `DRIVERS` (WRI codes 1..7, ES/EN labels), `DRIVERS_CAVEAT`. Pending owner review.

**Artifacts (`data/processed/frontend/`):**
- `deforestation_lossyear.png` (EPSG:3857 RGBA, ~3.3 MB): **R** = earliest loss-year code (1..25),
  **G** = loss density (0..255), **B** = dominant-driver code (1..7; 0 none), **A** = 255 where loss.
- `deforestation.json` (~0.16 MB): `meta`, `years` (2001..2025), `m` (muni indices), `loss`
  (per-muni annual ha), `national`, `ideam_national`, `causes`, `drivers` (code→label), and
  `loss_by_driver` (code→annual ha). `meta.drivers_source` = WRI citation + license + caveat.

**Frontend (`frontend/src/lib/`):**
- `LossRasterLayer.ts` — `BitmapLayer` subclass. std140 uniform block `lossUniforms { float maxYear;
  float hoverDriver; }` + GLSL `lossDriverColor(d)` (mirrors exported `DRIVER_COLORS` map). Shader:
  year-threshold crossfade (`maxYear` is a FLOAT calendar position), density→opacity, recency ramp,
  and a **hover spotlight** (`hoverDriver` 1..7 → matched cells take the driver colour & pop, rest
  fade). `draw()` pushes both uniforms via `setShaderModuleProps`.
- `state.svelte.ts` — `defPos` (float scrub position; `get defYear()` = floor), `defMuni`,
  `defHoverDriver` (0 none, 1..7).
- `MapView.svelte` — deforestation branch in `buildLayers()` pushes `LossRasterLayer` (`maxYear:
  app.defPos-2000`, `hoverDriver: app.defHoverDriver`) + transparent pickable `GeoJsonLayer` over
  `shapes` for the muni readout.
- `LegendDeforestation.svelte` — national loss meter, "Pérdida acumulada", **dynamic driver ranking**
  (re-orders by the scrubbed year's incidence; hover sets `app.defHoverDriver`), demoted IDEAM
  qualitative ranking, method details.
- `TimeBar.svelte` — deforestation branch: rAF continuous playback advancing `defPos`, `step="any"`
  slider, histogram with bottom-up fill.
- `DeforestationReadout.svelte` — per-muni click readout.
- `data.ts` — `DeforestationData`, `DeforestationDriver`, `loadDeforestation()`.
- `i18n.svelte.ts` — `def_*` keys incl. `def_drivers_title`, `def_drivers_hint`.

**Key reusable mechanism:** the (driver,year) accumulation in `build_deforestation.py` (one
`np.bincount` axis) + `loss_by_driver` JSON + dynamic ranking + `hoverDriver` shader spotlight is the
exact template both phases extend. Phase 2 adds two more such axes (ag-kind, legality) and a second
code texture for the map spotlight.

---

## Architectural decision: companion code texture + unified spotlight selector

The main PNG's RGBA channels are full (year/density/driver/mask). Phases 2a/2b need two more per-cell
codes for map highlighting (ag-kind, legality). Decision:

1. **Emit a second, grid-aligned texture** `deforestation_codes.png` (same bounds/size as the main
   raster, EPSG:3857): **R** = ag-kind code (1..N), **G** = legality code (1..M), **B** = coca-affected
   flag (0/1, period), **A** = same loss mask. `LossRasterLayer` binds it as a second sampler and
   samples at the identical texCoord (both textures share the grid).
2. **Unify the spotlight** into one selector to avoid uniform sprawl. Replace `hoverDriver` with:
   - state: `defSpot = $state<{ dim: 'driver'|'kind'|'legality'|'coca'|null; code: number }>`
   - shader uniforms: `float spotDim` (0 none, 1 driver, 2 kind, 3 legality, 4 coca), `float spotCode`.
   - shader reads the code channel selected by `spotDim` (driver from main.B, kind from codes.R,
     legality from codes.G, coca from codes.B), compares to `spotCode`, applies the existing
     spotlight/dim logic. Per-dim palettes via small GLSL `if`-chain colour functions (mirror TS maps).
   Migrate the existing driver hover onto this selector (dim:'driver').

This keeps ONE custom layer, ONE spotlight code path, and a clean per-dimension legend that drives it.

---

## Phase 2a — KIND of agriculture

> **REVISION 2026-06-24 — audits done; MapBiomas dropped, CORINE+ICA+SIMCI adopted.**
> MapBiomas Colombia C3 is **GEE-auth-only** (no headless download) **and** fuses pasture+cropland
> into one class (code 21) — it cannot do the pasture-vs-cattle split that is the whole point. Verified
> replacements (all no-auth):
> - **IDEAM CORINE Land Cover (national 1:100k)** — HAS a distinct **Pastos** class (codes 231/232/233)
>   separate from crops (211/221) and heterogeneous ag (241/24x). Latest national vintage **2022**.
>   Access: IDEAM ArcGIS REST, GeoJSON export, **EPSG:4686**, no token. Service:
>   `https://visualizador.ideam.gov.co/gisserver/rest/services/Estado_Cobertura_Tierra/MapServer`
>   (layer **7** = 2022; layer 3 = 2018). Field `nivel_2` ∈ {'21','22','23','24'}, `codigo` = full code.
>   **Caveat (load-bearing):** 1:100k, **25 ha minimum mapping unit** — under-resolves small/fragmented
>   clearing; and it is *land cover* → label "pasture cover (proxy for cattle ranching)", never "ranching".
>   License family open (IDEAM datos abiertos); explicit license string UNVERIFIED → owner-review flag.
> - **UNODC SIMCI coca density** — verified per-cell **per-year** (1 km grid, annual cols 2001–2023),
>   Socrata GeoJSON export, EPSG:4326, no auth, CC BY-SA 4.0. Field names are NOT regex-uniform:
>   `areacoca_2001..2003`, `areacoca2004`, `areacoca_2005..2021`, `coca2022_`, `areacoca2023` — map
>   explicitly. `0.0` = monitored-none vs missing-field = Socrata-omitted-null.
> - **ICA Censo Nacional Bovino** — per-municipio **cattle head time series 2016–2023**, DANE-keyed
>   (`CODIGO MUNICIPIO`), `.aspx` Excel, no auth. Self-consistent (2023 sum = 29,642,539 head ✓).
>   Sheet `BOVINOS Y PREDIOS`, header row 5, col `TOTAL BOVINOS` + `TOTAL FINCAS CON BOVINOS`. `.xls`
>   needs `xlrd`. No explicit license → cite ICA/FEDEGAN-FNG, owner-review flag. inventory ≠ cause.
>
> **Revised "kind" lens:** Pasto/ganadería (headline) · Cultivos · Coca (own per-year dim) · Mosaico/otro.
> Cattle count surfaced per-muni in the click readout. The build below replaces `load_agkind_grid` from
> MapBiomas with CORINE-from-REST; everything downstream (bincount axis, codes texture, JSON, lens) holds.

### Data acquisition (new pipeline scripts)

- **`pipeline/download_corine.py`** — IDEAM CORINE national 2022 (layer 7), REST GeoJSON, filtered to
  ag/pasture polygons (`where=nivel_2 IN ('21','22','23','24')`), paginated via `resultOffset`
  (`maxRecordCount` 20000). → `data/raw/corine/corine_2022_ag.geojson` + manifest. No auth.
- **`pipeline/download_coca.py`** — SIMCI Socrata geospatial export
  `https://www.datos.gov.co/api/geospatial/v3rx-q7t3?method=export&format=GeoJSON` →
  `data/raw/coca/coca_density.geojson` + manifest. No auth.
- **`pipeline/download_ica_bovino.py`** — ICA censo bovino `.aspx` Excel files (2018/2019/2022/2023) →
  `data/raw/ica/` + manifest. No auth.

### Build extension (`build_deforestation.py`)

- Add `load_agkind_grid()` mirroring `load_muni_labels()` (it's vector, not raster like the driver
  grid): `rasterio.features.rasterize` the CORINE GeoJSON polygons (reprojected 4686→build-grid CRS)
  onto the coarse grid, burning a per-cell ag-kind code: **1 Pasto (nivel_2 '23'), 2 Cultivos
  ('21'/'22'), 3 Mosaico/heterogénea ('24'), 0 none**. (CORINE is "what the cell is now"; combined with
  the loss mask this reads "cleared land now under X".)
- Add `load_coca_grid()`: rasterize SIMCI per-year `areacoca_*` onto the coarse grid → a per-(cell,year)
  coca-hectares array (coca IS genuinely time-varying — keep the full year series, don't collapse to a
  flag). For the codes texture, derive a per-cell coca-present flag = (any year > 0).
- In the loss loop, accumulate `agkind_ha[(kind-1)*N + (year-1)]` via `np.bincount` (same pattern as
  `driver_ha`). Coca handled as its own row/flag (precedence: report ag-kind from MapBiomas AND a coca
  overlay; do not silently overwrite pasture with coca — keep coca as a separate dimension).
- `national_by_agkind = agkind_ha.reshape(N_AGKIND, N_LOSS_YEARS)`. Print coverage %.
- Write the **codes texture** R channel = `agkind_cell` (reprojected to 3857), B channel = coca flag.

### Curated meta (`deforestation_meta_curated.py`)

- `AG_KINDS = [{code,label_es,label_en,source}]` — 1 Pasto/ganadería, 2 Cultivos, 3 Mosaico
  agropecuario; source = CORINE/IDEAM citation. (Coca handled as its own dimension, cite SIMCI.)
- `AGKIND_CAVEAT` — "subsequent land *cover* (CORINE 2022, 1:100k / 25 ha MMU), a proxy for land use
  not the clearing agent; pasture cover ≠ ranching outright."
- `CATTLE` — per-municipio ICA censo bovino (latest + a couple of earlier years for the trend), DANE
  code → head count; `CATTLE_CAVEAT` (vaccination-cycle inventory, correlation not causation). Cite
  ICA/FEDEGAN-FNG. All three tables `pending_owner_review`.

### JSON additions
`agkinds` (code→label), `loss_by_agkind` (code→annual ha), `coca_by_year` (annual ha within
coca-affected cells), `cattle` (per-muni head count, latest + trend), `meta.agkind_source` /
`meta.cattle_source` (CORINE + SIMCI + ICA citations, vintages, caveats).

### Frontend (Phase 2a)
- `data.ts`: extend `DeforestationData` with `agkinds`, `loss_by_agkind`, `coca_by_year`, and a second
  `codesImage: ImageBitmap`; `loadDeforestation` fetches `deforestation_codes.png` too.
- `state.svelte.ts`: replace `defHoverDriver` with `defSpot` selector (see decision above).
- `LossRasterLayer.ts`: bind second `codesImage` sampler; add `spotDim`/`spotCode` uniforms + GLSL
  `agKindColor()`; migrate driver hover.
- `MapView.svelte`: pass `codesImage`, `spotDim`, `spotCode`.
- `LegendDeforestation.svelte`: add a **segmented lens toggle** (Drivers | Agricultura | [Legalidad]).
  Each lens shows a ranked-by-year list; hovering a row sets `app.defSpot`. The "Agricultura" lens
  ranks `loss_by_agkind` + a coca row.
- `i18n.svelte.ts`: ag-kind labels + lens-toggle strings + caveat.

### Phase 2a verification
- Coverage % printed. Sanity: pasture should dominate agricultural loss across the Amazon arc; coca
  rows should concentrate in Catatumbo / Nariño / Putumayo / Guaviare. `npm run check` clean.
- Extend `smoke-deforestation.mjs`: switch the lens to "Agricultura", assert rows render, hover a row
  (spotlight, no console errors).

---

## Phase 2b — LEGALITY overlay

### Data acquisition (new pipeline scripts / one `download_boundaries.py`)
Vector boundary layers → rasterized per-cell flags:
- **UPRA Frontera Agrícola Nacional (2018, 1:100k)** — inside = ag permitted; outside = non-permitted.
  Shapefile/GDB via SIPRA + Datos Abiertos. https://www.datos.gov.co/Agricultura-y-Desarrollo-Rural/Identificaci-n-general-de-la-frontera-agr-cola-en-/6rau-hqeb
- **RUNAP protected areas (SINAP)** — inside = protected (clearing illegal). Direct shapefile,
  MAGNA-SIRGAS (EPSG:4686). https://storage.googleapis.com/pnn_geodatabase/runap/latest.zip
- **Reserva Forestal de Ley 2ª de 1959** — restricted-use forest reserve (SIAC). Confirm layer/vintage.
- **Resguardos indígenas / tierras de comunidades negras (ANT)** — collective tenure. Confirm at audit.

**AUDIT FIRST:** field names, geometry validity, CRS (reproject 4686→build grid), and the vintage of
each layer.

### Build extension
- `load_boundary_masks()`: rasterize each polygon set onto the coarse grid (`rasterio.features
  .rasterize`, like `load_muni_labels()`). Combine into a per-cell **legality code** by priority:
  `1 protected (RUNAP)` > `2 forest reserve (Ley 2ª)` > `3 outside ag frontier` > `4 permitted`.
  (Resguardos = an additional flag/dimension, not necessarily "illegal" — frame as tenure context.)
- Accumulate `legality_ha[(code-1)*N + (year-1)]`. Write codes texture **G** channel = legality code.
- **Temporal honesty:** boundaries are single-vintage. Either restrict the legality call to loss years
  ≥ boundary vintage, or label "boundaries as of <vintage>; earlier loss judged against current zones."
  Owner decision — default to labelling + showing all years, with the caveat prominent.

### Curated meta + JSON
- `LEGALITY_CLASSES = [{code,label_es,label_en,source}]` with one citation per boundary source +
  vintages. `LEGALITY_CAVEAT` (zonal-not-adjudicated; temporal-vintage). JSON: `legality_classes`,
  `loss_by_legality`, `meta.legality_sources`.

### Frontend (Phase 2b)
- Add the "Legalidad" lens to the segmented toggle; ranks `loss_by_legality`, hover → `defSpot
  {dim:'legality'}`. GLSL `legalityColor()` (e.g. red = protected, orange = reserve, amber = outside
  frontier, muted = permitted). i18n labels + the mandatory zonal/temporal disclaimer line.

### Phase 2b verification
- Sanity: protected-area loss should concentrate in Tinigua, Sierra de la Macarena, Chiribiquete,
  La Paya, Nukak, Picachos (known incursion parks). `npm run check` clean; smoke covers the lens.

---

## Integrity caveats (non-negotiable — must be labelled in-UI; carry verbatim intent from the doc)

1. **Subsequent land cover ≠ proximate agent.** MapBiomas says what land *became*, not who cleared it.
   Frame "subsequent land use," never "cleared by X."
2. **Legality is ZONAL, not adjudicated.** "Outside the frontier" / "inside a park" = land use not
   permitted *there*, NOT a verdict against a person. We can't see permits/rights/dates per pixel.
3. **Temporal alignment is load-bearing.** Boundaries (frontier 2018; RUNAP/resguardos evolving) judge
   loss across 2001–2025 — label the vintage; never present an anachronistic call as fact.
4. **Coca presence ≠ coca-driven loss.** SIMCI density is grid-level correlation.
5. **Definitions stack:** Hansen tree-cover-loss ≠ IDEAM deforestation (already labelled). The WRI
   driver, ag-kind, and legality dimensions are *independent attributions of the same loss*, each with
   its own source/definition — never conflate.
6. **Every curated row keeps one citation; tables stay `pending_owner_review`** (party_lr.py discipline).
7. **Join on DANE code; reproject all sources to the build grid; never hand-edit processed files.**

---

## File manifest

**New pipeline:** `download_mapbiomas.py`, `download_coca.py`, `download_boundaries.py`.
**Edited pipeline:** `build_deforestation.py` (+ `load_agkind_grid`, `load_coca_grid`,
`load_boundary_masks`, two new bincount axes, codes-texture writer, JSON additions),
`deforestation_meta_curated.py` (`AG_KINDS`, `AGKIND_CAVEAT`, `LEGALITY_CLASSES`, `LEGALITY_CAVEAT`).
**New artifact:** `data/processed/frontend/deforestation_codes.png`.
**Edited frontend:** `data.ts`, `state.svelte.ts` (`defSpot`), `LossRasterLayer.ts` (2nd sampler +
unified spotlight), `MapView.svelte`, `LegendDeforestation.svelte` (lens toggle + 2 new ranked lists),
`i18n.svelte.ts`, `scripts/smoke-deforestation.mjs`.

## Build & verify sequence
1. `python pipeline/download_mapbiomas.py && python pipeline/download_coca.py && python pipeline/download_boundaries.py`
2. `python pipeline/build_deforestation.py` → check coverage %, codes texture size, JSON series.
3. `cd frontend && npm run check` → 0 errors.
4. `npm run dev` + `SMOKE_URL=… node scripts/smoke-deforestation.mjs` → lens toggle, hover spotlights,
   no console errors, violence view intact.

## Open audit items (resolve at build, do not assume)
- MapBiomas Colombia C3.0 exact GEE asset path / GeoTIFF download URL + class legend codes + license.
- SIMCI coca dataset format + temporal granularity (per-year feasible?).
- Boundary layers: field names, CRS, geometry validity, **vintages**, licenses.
- Decide coca precedence vs MapBiomas ag-kind, and the legality temporal-vintage policy (owner call).

## Phasing
Ship **2a first** (kind-of-agriculture: biggest narrative payoff, lowest legal risk), then **2b**
(legality). The companion-texture + unified-spotlight refactor lands in 2a and 2b reuses it.
