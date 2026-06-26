# Data Source Research — Deforestation, Colombia 2000–present

> **Status: PRE-AUDIT SCOPING DOC (produced 2026-06-19).** Findings below are from web research,
> not from a hands-on download + column audit of the actual files. Every "verified" tag here means
> *verified against a cited web source*, NOT against downloaded data — contrast with
> `docs/data-sources.md`, whose claims survived an empirical file audit. The empirical audit for
> deforestation is still owed; open questions it must resolve are listed at the bottom. Do not
> treat tile IDs, formats, CRS, or licenses as settled until the audit confirms them.

## Project framing

A deforestation layer for the `MapColombia` artifact, parallel to the violence/elections layers.
The owner's spec is four dimensions: **where** areas were lost, **to which groups**, **for what
reasons**, **exactly when**. Research verdict (2026-06-19): the four dimensions split cleanly.

| Dimension | Availability | Form |
|---|---|---|
| **WHERE** | Strong | Pixel-level raster (30 m), wall-to-wall, annual |
| **WHEN** | Strong | Annual (`lossyear` band; IDEAM quarterly early-warning) |
| **WHO** (armed groups, ranchers, colonos, miners) | Weak | Expert-attributed *regions*, not per-pixel events |
| **WHY** (drivers) | Weak | Ranked national list; no clean official per-driver % split |

WHERE/WHEN are *better* covered than the violence data (continuous, not point events). WHO/WHY do
**not** exist as georeferenced event data with a joinable `actor_id`/`reason` + citation. They are
analyst-authored narratives over specific regions. This collides with the project's non-negotiable
("every event record must carry a source citation; never fabricate/estimate/interpolate"), so the
attribution layer is representable **only** as low-resolution, cited, expert-attributed polygons,
explicitly labeled *"expert-attributed, not observed"* — the same curated-citation discipline as
`pipeline/party_lr.py` (the Memoria left–right scores).

## WHERE + WHEN — loss layer

Decision (per owner, 2026-06-19): **IDEAM primary for figures/authority, Hansen for the render.**

### IDEAM SMByC — Sistema de Monitoreo de Bosques y Carbono — PRIMARY (authority)

- **What**: Colombia's *official* forest/deforestation monitoring, run by IDEAM. Methodology tuned
  to Colombian conditions (cloud cover, Andes/Amazon). Three components: (i) bosque/no-bosque +
  deforestation, (ii) biomass/carbon, (iii) **causas y agentes** (feeds the attribution layer
  below). [verified — IntechOpen chapter, IDEAM]
- **Coverage**: wall-to-wall annual since ~1990 (system operational since 2012, with historical
  back-series). 2024 national figure: **113,608 ha** (IDEAM/MinAmbiente, "second-lowest in recent
  history"). [verified — IDEAM/Presidencia/MinAmbiente press, 2025-07]
- **Geo / access**: spatial layers published via **SIAC Geovisor / IDEAM "CAPAS GEO"** as
  **shapefile downloads + WMS geoservices** (consume online without download). [verified — SIAC
  recursos page; *exact layer name/format/CRS to confirm at download*]
- **Early-warning bulletins (AT-D)**: quarterly, with estimated monthly deforestation for Amazon
  departments AND identification of **núcleos de deforestación** with stated causes/agents — this
  is the bridge to the WHO/WHY layer. PDF + portal. [verified — Visión Amazonía]
- **2024 department hotspots** (for the meter / department drilldown): Caquetá **25,263 ha**,
  Meta **21,107**, Guaviare **16,908**, Putumayo **5,443**. [verified — IDEAM 2024 press]
- **License**: Colombian public-sector open data; **exact license string TBD at audit** (likely a
  datos.gov.co / SIAC open license requiring attribution). Do not assert until checked.
- Sources: http://www.ideam.gov.co/capas-geo ; http://www.ideam.gov.co/en/web/siac/geovisorconsultas ;
  https://www.siac.gov.co/recursos ;
  https://visionamazonia.minambiente.gov.co/news/datos-de-monitoreo-de-bosques-en-colombia-son-de-acceso-publico/ ;
  https://www.ideam.gov.co/sala-de-prensa/noticia/en-2024-colombia-consolido-la-segunda-cifra-de-deforestacion-mas-baja-en-de-la-historia

### Hansen / UMD Global Forest Change (GFC-2025-v1.13) — PRIMARY (render)

- **What**: global 30 m raster from Landsat time-series (Hansen et al., UMD/GLAD). Bands include
  `treecover2000`, annual **`lossyear`** (encoded **1–25 = calendar years 2001–2025**, 0 = no
  loss), `gain` (2000–2012 cumulative), masks. This *is* "which 30 m areas, which year." [verified —
  UMD download page + GEE catalog]
- **Access**: GeoTIFF 10°×10° tiles (Google Cloud Storage) OR Google Earth Engine asset
  `UMD/hansen/global_forest_change_2025_v1_13`. Free. [verified]
- **Version note**: the MVP first built from GFC-2024-v1.12 (through 2024), then upgraded to
  **GFC-2025-v1.13** (through 2025) — Hansen ships one new loss year per ~annual release. The
  version is pinned in `download_hansen.py`; bump it when a newer GFC-YYYY release lands.
- **Colombia tiles (verified at download)**: country bbox ≈ lon 79.0–66.8 W, lat 4.2 S–13.4 N →
  tiles named by NW corner in 10° steps: **{20N, 10N, 00N} × {080W, 070W}** = 6 granules.
- **License**: GFC data is publicly available; **exact license/citation form TBD at audit** (the
  data has a required citation to Hansen et al. 2013 Science + the version). Do not assert CC-BY
  until checked.
- **Divergence from IDEAM**: Hansen "tree cover loss" ≠ IDEAM "deforestation" (different
  definitions — tree-cover loss includes plantations/fire/natural; deforestation is permanent
  natural-forest conversion). Absolute numbers differ. **Render Hansen for the smooth pixel visual;
  cite IDEAM for every headline figure.** Never present a Hansen number as an IDEAM figure.
- Source: https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/download.html

### Global Forest Watch (GFW) — convenience layer for aggregates

- GFW repackages Hansen + provides a country/admin API (annual tree-cover loss by GADM admin
  level). Useful for the **time-series meter** and municipio aggregates without processing rasters
  yourself, but it is Hansen-derived — same definitional caveat vs IDEAM. [verified — GFW dashboard]
- Source: https://www.globalforestwatch.org/dashboards/country/COL/

## WHO + WHY — attribution overlay (curated, cited, low-res)

No source provides per-pixel actor/driver attribution. Build a **curated citations table**
(`deforestation_attribution.json`, modeled on `memoria.json` / `party_lr.py`): each row = a region
or núcleo + attributed actor(s) + driver(s) + **one citation** + an explicit *"expert-attributed"*
flag. Never add a row without a citation. Sources for rows:

- **IDEAM SMByC "causas y agentes" + AT-D bulletins** — official núcleos with stated causes/agents.
  [verified exists; granularity = núcleo/region, qualitative]
- **FCDS (Fundación para la Conservación y el Desarrollo Sostenible)** — Rodrigo Botero; forest loss
  concentrated where governance is lost to armed groups, land-use tied to armed-group interests.
  Report-level, region-specific. [verified — Mongabay 2025-04]
- **MAAP (Monitoring of the Andean Amazon Project, Amazon Conservation)** — e.g. **MAAP #224**
  (Chiribiquete NP / Llanos del Yarí: 198 ha 2024–early 2025), often co-produced with FCDS.
  Per-report, per-region, georeferenced to a named area. [verified — maapprogram.org]
- Sources: https://news.mongabay.com/2025/04/armed-groups-cattle-ranchers-drove-35-rise-in-colombias-deforestation-in-2024/ ;
  https://www.maapprogram.org/chiribiquete-yari-colombia/

### Driver list — for the causes pie (ESTIMATE-ONLY, must be labeled)

IDEAM publishes a **ranked** driver list, NOT an official year-by-year percentage split:

1. Praderización / ganadería extensiva — **now the dominant driver** (minister stated explicitly it
   is *above* illicit crops as of 2024)
2. Desarrollo no planificado de infraestructura de transporte (illegal roads)
3. Cultivos de uso ilícito
4. Extracción ilegal de madera
5. Minería ilegal
6. Expansión de la frontera agrícola en zonas no permitidas

[verified — IDEAM/MinAmbiente 2024 press]. **The pie chart is honest ONLY if labeled "estimated
share, IDEAM-ranked" with citation** — precise shares are not officially published. If hard numbers
are wanted, they must be *derived* (e.g. area inside coca-monitoring polygons vs. cattle-frontier
núcleos), which is itself an estimate and must be flagged as such. Do not present invented
percentages.

- Source: https://www.ideam.gov.co/sala-de-prensa/noticia/en-2024-colombia-consolido-la-segunda-cifra-de-deforestacion-mas-baja-en-de-la-historia

### Drivers over time — WRI / Google DeepMind Global Drivers of Forest Loss (1 km) — CANDIDATE for a time-varying causes display

> Scoped 2026-06-24 (web-verified, NOT yet downloaded/audited). This is the one public dataset that
> could replace the static ranked causes list with a **per-year breakdown of loss by driver**. It is
> a real, ingestible option — but it answers a *different* question in a *different* vocabulary than
> the IDEAM ranking, so read the caveats before adopting it.

- **What**: a global raster classifying the **dominant driver of tree-cover loss at 1 km, 2001–2024**
  (v1.2), produced by WRI / Land & Carbon Lab / Google DeepMind with a neural net. Supersedes the
  10 km Curtis et al. (2018) map. **Seven** driver classes: *permanent agriculture, hard commodities,
  shifting cultivation, logging, wildfires, settlements & infrastructure, other natural
  disturbances*. Ships per-class probability layers too. [web-verified — WRI/GFW/ERL]
- **Publication / citation**: Sims, M., R. Stanimirova, A. Raichuk, M. Neumann, et al. (2025),
  "Global drivers of forest loss at 1 km resolution", *Environmental Research Letters*. DOI
  10.1088/1748-9326/add606.
- **Access**: GEE asset `projects/landandcarbon/assets/wri_gdm_drivers_forest_loss_1km/v1_2_2001_2024`;
  bulk download via the **WRI Open Data Portal** (datasets.wri.org → "Dominant drivers of tree cover
  loss at 1km") and **Zenodo**. A direct-download path exists, so no GEE dependency is forced (matches
  our `urllib` download pattern). [web-verified]
- **License**: **NOT confirmed** in research — the search did not surface an explicit string. WRI ODP
  datasets are commonly CC BY 4.0, but **verify on the dataset page before any public use** (same
  discipline as the IDEAM/Hansen license items below).

**How it would produce "causes over time" in our pipeline** (cheap extension, data already on disk):
intersect our native **30 m Hansen `lossyear`** (already downloaded) with the 1 km driver class — for
each loss pixel, sample the driver class at its location and accumulate hectares into `(year, driver)`
and `(muni, year, driver)` bins. This adds one axis to the existing sparse-scatter histogram in
`build_deforestation.py`; emit `loss_by_driver` (7 annual series) + a `drivers` meta block (code →
ES/EN label + colour) into `deforestation.json`. The frontend already has the year scrubber (`defPos`);
the new panel is a stacked-area / animated composition keyed to it.

**Integrity caveats — all must be labeled in-UI if adopted:**
1. **The driver attribution is time-INVARIANT.** The dataset is a *single dominant driver per 1 km
   cell for the whole 2001–2024 period*, not a per-year driver map. Any year-to-year movement in the
   chart comes **entirely from Hansen's loss timing** intersected with that fixed class — it is "*when*
   the loss happened, attributed to that location's *period-dominant* driver," **not** an annual driver
   survey. A cell whose driver changed mid-period is collapsed to one label. This is the single most
   important honesty caveat and contradicts a naive reading of "causes changing over time."
2. **Taxonomy mismatch with IDEAM.** The 7 global classes are not IDEAM's Colombia-specific drivers;
   "hard commodities" / "permanent agriculture" / "shifting cultivation" do **not** map 1:1 to
   praderización-ganadería / cultivos de uso ilícito / vías ilegales / minería. Colombian loss likely
   concentrates in a couple of classes, under-resolving the IDEAM narrative. Keep the curated IDEAM
   ranking (`deforestation_meta_curated.py`) as the qualitative Colombia panel; present this series as
   a **separate, differently-defined** artifact, not a replacement.
3. **Hansen definition, not IDEAM.** This describes drivers of *tree-cover loss* (Hansen), not IDEAM
   *deforestation* — the same definitional gap already labeled across the view.
4. **Resolution mismatch.** 1 km driver × 30 m loss: fine for national / municipio aggregates;
   sub-kilometre attribution is meaningless, and small municipios may contain very few driver cells.
- Sources: https://iopscience.iop.org/article/10.1088/1748-9326/add606 ;
  https://developers.google.com/earth-engine/datasets/catalog/projects_landandcarbon_assets_wri_gdm_drivers_forest_loss_1km_v1_2_2001_2024 ;
  https://datasets.wri.org/datasets/dominant-drivers-of-tree-cover-loss-at-1km ;
  https://www.globalforestwatch.org/blog/data-and-tools/new-drivers-data-forest-loss/ ;
  https://www.wri.org/insights/forest-loss-drivers-data-trends

### KIND of agriculture + LEGALITY — Colombia-specific overlay — SCOPED (Phase 2, not built)

> Scoped 2026-06-24 (sources web-verified, none downloaded/audited). The WRI driver layer (above) is
> SHIPPED but collapses ~89 % of Colombian loss into one bucket, "permanent agriculture," with no
> crop/livestock split and no coca class (it is split by *permanence*, not by *what is grown* or
> *whether it is lawful*). This section scopes what it takes to answer the two questions that bucket
> hides: (A) **what kind of agriculture** (pasture vs cropland vs coca vs palm) and (B) **is it
> legal** (which is fundamentally a question of *where* — inside protected/restricted zones, or
> outside the official agricultural frontier). Both are Colombia-specific overlays built by
> intersecting Hansen loss with national sources; both are materially heavier than the WRI step.

**A. KIND of agriculture** — refine "permanent agriculture" via *subsequent land cover* + crop layers:

- **Pasture vs cropland — MapBiomas Colombia (Collection 3.0).** Annual land-cover/land-use raster,
  **30 m, 1985–2024**, ~21 classes incl. distinct **Pastos (pasture)** vs **Agricultura** vs mosaics.
  Aligns natively with Hansen 30 m (both Landsat). Method: for each Hansen loss pixel, read the
  MapBiomas class a year or two AFTER the loss year → "forest became pasture / cropland / mosaic."
  GeoTIFF per year via the MapBiomas platform ("Crear análisis") and Google Earth Engine.
  License: MapBiomas standard (CC BY-SA — confirm on the Colombia collection page). This is the
  single highest-value layer: it directly separates the cattle-frontier (pasture) from crops, which
  is exactly the IDEAM #1 (praderización/ganadería) vs the rest distinction the WRI data loses.
  Sources: https://colombia.mapbiomas.org/en/ ; https://colombia.mapbiomas.org/en/productos/
- **Coca — UNODC SIMCI "Densidad de Cultivos de Coca".** Official annual coca-cultivation density,
  georeferenced (density grid + municipal), the authoritative Colombian source. Method: flag/weight
  loss falling within coca-affected cells per year → "loss within coca-affected areas." Maps onto
  IDEAM #3 (cultivos de uso ilícito). Open data via Datos Abiertos (Min. Justicia) + Biesimci portal.
  Sources: https://www.datos.gov.co/Justicia-y-Derecho/Densidad-de-Cultivos-de-Coca-Subdirecci-n-Estrat-g/v3rx-q7t3 ;
  https://www.unodc.org/colombia/es/simci/simci.html ; https://biesimci.org/
- **Oil palm (optional, lower priority).** A global oil-palm layer (Descals et al.) or Fedepalma maps
  could peel palm out of "agriculture," but Colombian palm sits mostly outside the deforestation
  frontier — defer unless the frontier analysis shows it matters.

**B. LEGALITY** — a spatial question: was clearing *permitted at this location*? Build per-pixel zone
flags from official boundary layers, then classify loss as permitted / restricted-zone / illicit:

- **UPRA Frontera Agrícola Nacional (2018, 1:100 000).** The official boundary of where agriculture is
  legally permitted. Agricultural loss **outside** the frontier is, by definition, non-permitted land
  use. This is the single cleanest "is the agriculture legal" signal. Shapefile/GDB/KMZ via SIPRA +
  Datos Abiertos. Sources: https://www.datos.gov.co/Agricultura-y-Desarrollo-Rural/Identificaci-n-general-de-la-frontera-agr-cola-en-/6rau-hqeb ;
  https://sipra.upra.gov.co/
- **RUNAP protected areas (SINAP).** National + regional protected-area boundaries; clearing inside is
  illegal regardless of driver. Consolidated shapefile, MAGNA-SIRGAS (EPSG:4686), direct download.
  Sources: https://storage.googleapis.com/pnn_geodatabase/runap/latest.zip ;
  https://runap.parquesnacionales.gov.co/cifras
- **Reserva Forestal de Ley 2ª de 1959** (restricted-use forest reserve) and **resguardos indígenas /
  tierras de comunidades negras** (ANT collective tenure) — additional restricted/own-consent zones;
  loss inside carries a distinct legal status. Available via SIAC / ANT open data (confirm exact
  layers + vintage at audit).
- **Activity-intrinsic illegality**: coca (SIMCI, above) is illegal by definition; illegal mining maps
  loosely to WRI "hard commodities." These complement the zonal flags.

**Method sketch** (extends `build_deforestation.py`): rasterize each boundary layer onto the existing
coarse grid (point-in-polygon → per-cell flags), sample MapBiomas + SIMCI per loss pixel, and
accumulate hectares per `(year, ag-kind)` and per `(year, legality-status)` — same sparse-scatter
pattern already used for `(muni, year)` and `(driver, year)`. Emit new series + a new PNG channel or
companion raster for the per-pixel legality flag, feeding one or two new panels.

**Integrity caveats — non-negotiable, must be labeled in-UI:**
1. **Subsequent land cover ≠ proximate agent.** MapBiomas tells you what the land *became* (pasture/
   crop) — a strong proxy for *why* it was cleared, but not proof of *who* cleared it. Frame as
   "subsequent land use," never "cleared by X."
2. **Legality is ZONAL, not adjudicated.** "Outside the agricultural frontier" / "inside a protected
   area" means the land use is *not legally permitted there* — it is NOT a court finding against any
   person. Per-pixel we cannot see permits, pre-existing rights, dates, or exceptions. Frame as
   "permitted zone vs restricted/illicit zone," never "this actor broke the law." Same discipline as
   `party_lr.py` / the curated tables.
3. **Temporal alignment is load-bearing for the legality call.** Boundaries have vintages (frontier =
   2018; protected areas and resguardos expand over time). Judging 2005 loss against a 2018 boundary
   is anachronistic — use the boundary vintage, prefer time-matched layers where they exist, and label
   the mismatch where they do not.
4. **Coca presence ≠ coca-driven loss.** SIMCI density is correlation at grid resolution; loss inside
   a coca cell may still be pasture. Frame as "loss within coca-affected areas."
5. **Licenses + CRS**: confirm each (MapBiomas CC BY-SA; Datos Abiertos / RUNAP open; SIMCI/UNODC
   terms) and reproject MAGNA-SIRGAS (EPSG:4686) sources to the build grid. One citation per layer.

**Effort**: substantially larger than the WRI step — 4–5 new acquisition scripts (one large raster
series from MapBiomas; several vector boundary sets; SIMCI grid), several raster+vector intersections,
careful legality framing, and 1–2 new UI panels. Phase it: **2a** = kind-of-agriculture
(pasture/crop/coca) first (highest narrative payoff, lowest legal risk); **2b** = legality overlay
(frontier + protected areas) second.

## Architecture fit (why same repo, new section)

- **Reuses**: DIVIPOLA join, `munis_shapes.json` municipality polygons (DANE MGN), map shell
  (MapLibre + deck.gl `MapboxOverlay`), CARTO basemap, time slider, D3 chart components, bilingual
  i18n, perf-tier governor, GH Pages + R2 hosting, and the project-wide data-integrity rules.
- **New (different from the point-cloud violence layer)**: the loss layer is **raster/areal**, not
  points — a parallel deck.gl render path (raster/bitmap tiles or pre-vectorized per-year polygons),
  NOT the float32-encoded point cloud + `filterRange` scrubbing from `docs/stack-decision.md`. Those
  constraints aren't violated, they simply don't apply to this layer.
- **Pipeline (to write)**: `pipeline/download_ideam.py`, `pipeline/download_hansen.py`,
  `pipeline/build_deforestation_data.py` → `data/processed/frontend/deforestation.bin`
  (+ curated `deforestation_attribution.json`). New dep for the raster step: `rasterio`/`rioxarray`
  (geopandas already present).

## MVP realized — 2026-06-19 (build-verified facts)

The pixel-raster MVP is built and runs behind `?section=deforestation`. Concrete facts from the
actual download + build (supersede the estimates above where they conflict):

- **Hansen tiles**: the 6 granules exist and were fetched from **GFC-2025-v1.13** (the MVP first
  used GFC-2024-v1.12, then upgraded to v1.13 for the 2025 loss year) —
  `Hansen_GFC-2025-v1.13_lossyear_{20N,10N,00N}_{080W,070W}.tif`. Total **300 MB** compressed
  GeoTIFF (smaller than the ~1–2 GB feared). Fetched by `pipeline/download_hansen.py`
  (manifest + sha256 in `data/raw/hansen/`). Native 30 m, `lossyear` 1–25 = 2001–2025.
- **Build** (`pipeline/build_deforestation.py`, dep: `rasterio` 1.5.0): bbox lon −80…−66, lat −5…14;
  coarse display grid **2240×3040 @ ~695 m** (FACTOR=25); zonal stats counted from native 30 m,
  lat-corrected, joined on DANE via `munis_shapes properties.i`. Outputs
  `deforestation_lossyear.png` (EPSG:3857, R=earliest year, G=loss density; **2.8 MB**) and
  `deforestation.json` (**0.15 MB**, 1118 munis + national series + curated IDEAM/causes).
- **Hansen vs IDEAM sanity check**: Hansen national tree-cover loss 2024 = **247,620 ha**
  (2025 = **219,602 ha**; total 2001–2025 = **6.16M ha**) vs IDEAM deforestation 2024 =
  **113,608 ha** — same order of magnitude, Hansen ~2.2× higher as expected (it counts
  plantations/fire/natural loss, not just permanent natural-forest conversion). Confirms the
  definitional caveat is real and must stay labeled.
- **Join validated**: top-loss municipios are the known Amazon-arc hotspots (San Vicente del Caguán,
  Cartagena del Chairá, La Macarena, San José del Guaviare, Puerto Guzmán) — DANE join is correct.
- **Display honesty fix**: a cell lights only with opacity ∝ loss *density* (fraction of the cell's
  30 m pixels lost), not "any loss = full cell" — otherwise 25 years of scattered loss paints the
  whole country. Appearance year = the cell's earliest loss; intensity reflects *total* loss (a
  documented approximation vs true per-year density, which would need 25 channels).
- **Licenses still TBD**: IDEAM spatial-layer license and the exact Hansen citation/license string
  remain unconfirmed (MVP cites Hansen et al. 2013 + version; IDEAM figures are curated-cited in
  `pipeline/deforestation_meta_curated.py`, pending owner review). Audit items 3–6 below still owed.

## Empirical audit — OWED (resolve before relying on this doc)

Mirror of `download_cnmh.py` / `audit_raw.py` discipline. None of this is done yet:

1. **IDEAM layer reality**: exact CAPAS GEO layer name(s), download format (shapefile? GeoTIFF?),
   CRS (EPSG:4686? 4326?), temporal granularity (which years are downloadable as spatial layers vs
   PDF-only), and the **license string**. Confirm the deforestation polygon layer joins on
   `mpio_cdpmp` / 5-digit DANE, or is pixel-only.
2. **Hansen tiles** (RESOLVED for v1.13): the 6 granules + naming are confirmed and fetched
   (manifest + sha256 in `data/raw/hansen/`). Still owed: the exact data citation/license string
   to assert (MVP cites Hansen et al. 2013 + version, which is the conventional requirement).
3. **National time-series reconciliation**: pin one annual series. Web sources **conflict** on the
   2024 delta — Mongabay/Hansen framing says "≈1,070 km² (~107,000 ha), **+35%** vs 2023" while
   IDEAM-derived reporting cites **113,608 ha** and a much smaller increase (one source said +6%).
   These are different definitions (Hansen tree-cover-loss vs IDEAM deforestation) AND possibly
   different baselines — do not display a delta until the series and its definition are pinned to a
   single cited source.
4. **Causes %** (decided: derived estimates): pin the driver-proxy geometries (coca-monitoring
   polygons, cattle-frontier núcleos, mining/road buffers) and the loss-intersection derivation
   rule, each cited. Still check whether any IDEAM technical annex/AT-D bulletin carries an official
   split — if one exists, prefer it over the derivation. Disclaimer copy is mandatory in-UI.
   **Alternative path now scoped** (see "Drivers over time — WRI/Google DeepMind" above): the GFW 1 km
   driver raster gives a ready, quantified per-year loss-by-driver series via Hansen-intersection —
   but in 7 generic global classes and with a *time-invariant* per-cell attribution. If adopted, audit
   owes: confirm its license string, decide whether it augments or replaces the IDEAM ranking, and
   pin the exact intersection/aggregation rule. It does **not** discharge the IDEAM-specific
   derivation above; the two are different artifacts.
5. **Attribution table provenance**: decide the citation contract (one per row) and the
   region-geometry source (IDEAM núcleo polygons? hand-digitized from MAAP report maps?).
6. **Coordinate/precision honesty**: as with `CNMH placeholder coordinates`, ensure no node-level
   precision is fabricated when only a region is known.

## Owner decisions (2026-06-19)

- **Display window: 2001–present.** The deforestation tab carries its own window, NOT the
  1958–present window of violence/elections (Hansen `lossyear` starts 2001; IDEAM spatial
  back-series only reaches ~1990 anyway). When layers are cross-viewed against violence/elections,
  the pre-2001 absence must be shown as "no deforestation data," never as zero loss.
- **Causes pie: attempt percentages, with a clear disclaimer.** Since IDEAM publishes no official
  per-driver split, the shares are **derived estimates** — compute them from a documented,
  reproducible method (e.g. area of loss intersected with driver-proxy geometries: coca-monitoring
  polygons, cattle-frontier núcleos, mining/road buffers) and surface a prominent in-UI disclaimer
  ("estimated distribution — derived, not an official IDEAM figure") plus the method + citations.
  This is an audit deliverable: the proxy geometries and the derivation rule must be pinned and
  cited before any percentage is shown. Treat with the same caution as `party_lr.py` (pending
  scholarly review before public citation).

## Render: 30 m tile pyramid (2026-06-26)

The loss raster is rendered from a Web-Mercator **PMTiles pyramid**
(`deforestation_lossyear.pmtiles`, zoom 5..12, finest ~38 m/px ≈ native 30 m) via a deck.gl
`TileLayer` that instantiates one `LossRasterLayer` per tile. This replaced the single
full-country texture, which could not reach 30 m (one GL texture caps ~115–230 m).

- **Build**: `pipeline/build_deforestation_tiles.py` (reuses `build_deforestation.py`'s loaders
  and constants; adds the `pmtiles` pip dep). Streams native Hansen `lossyear` pixels into
  z12 tiles (R=earliest year, B=packed driver/ag-kind/legality/coca, G=presence), then builds
  z11..z5 overviews bottom-up with **categorical-safe** aggregation (R=earliest, B=packed of that
  child) and **density-conserving** means (G=mean) so opacity is continuous across zoom and the
  national view stays honest (scattered loss reads faint, never solid amber).
- **Smoothness**: `refinementStrategy:'best-available'` (parent stays visible until the child
  loads → no blank), conserving overviews (no brightness pop), and a **geo-locked** burn-front
  noise (`tileBounds` uniform maps per-tile uv → country-relative coords) so the noise does not
  seam across tiles or swim on LOD changes. Nearest filtering remains mandatory (packed B byte).
- **Integrity unchanged**: per-municipio / national hectares are still counted from native 30 m
  pixels in `build_deforestation.py`; the pyramid is display-only.
- **Hosting (MVP)**: the ~170 MB `.pmtiles` is gitignored and served from `public/data` for dev.
  Production move to Cloudflare R2 (range requests) + an upload script is a deferred follow-up;
  so is forest-backdrop tiling and PNG size optimization.
