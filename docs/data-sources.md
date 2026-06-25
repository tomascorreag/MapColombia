# Data Source Research — Violence & Election Data, Colombia 1980–present

> Produced 2026-06-05 via adversarially-verified deep research (22 sources fetched, 25 claims
> verified by 3-vote panels; 21 confirmed, 4 refuted). Confidence noted per item.
> Refuted claims are listed at the bottom — do not rely on them.

## Violence data (event-level)

### CNMH — Observatorio de Memoria y Conflicto (OMC / SIEVCAC) — PRIMARY CANDIDATE

- **What**: Event/case-level databases for ~11 violence modalities, including a dedicated
  **Masacres** layer, in both *Víctimas* and *Casos* formats. ~353,531 events total;
  24,518 massacre deaths. [high confidence, 3-0]
- **Coverage**: 1944–2026 (cutoff 31/03/2026; semiannual cutoffs Mar 31 / Sep 30). Fully
  contains 1980–present. [high, 3-0]
- **Massacre definition**: intentional homicide of 4+ defenseless persons in the same
  circumstances of mode/time/place; 3 or fewer = "asesinato selectivo" (separate layer). [high, 3-0]
- **Geo**: georeferenced layers on the CNMH ArcGIS Geoportal
  (https://geoportal-de-datos-abiertos-cnmh-cnmh.hub.arcgis.com/); also on datos.gov.co. [high, 3-0]
- **Access**: .xlsx downloads (Víctimas Masacres ~1.98 MB, Casos ~556 KB) behind **free
  registration** on the official portal; open mirrors may exist (datos.gov.co). [high, 3-0]
- **License — RESOLVED 2026-06-10**: the 2026-03-31 geoportal cut states **CC BY 4.0** in the
  `licenseInfo` field of all 11 ArcGIS Online items (verified per-item via the AGOL REST API;
  snapshot in `docs/evidence/cnmh-agol-license-2026-06-10.json`). The 2024-09-30 socrata cut
  on datos.gov.co is **CC BY-SA 4.0** — the two cuts carry *different* licenses. (The earlier
  0-3 refutation below predates this per-item verification and concerned the blanket claim,
  not the geoportal items.) Given CNMH licensing instability, re-check `licenseInfo` and
  refresh the evidence snapshot whenever a new cut is downloaded.
- **⚠ Controversies**: 2024 retroactive scope extension (1958→1944) and reported database
  alterations under the Gaitán-era directorship. Affects mainly pre-1958 records (outside our
  window), but: **pin a specific dated cut of the data and record the cutoff date**. [medium]
- Sources: https://micrositios.centrodememoriahistorica.gov.co/observatorio/portal-de-datos/base-de-datos/ ;
  https://micrositios.centrodememoriahistorica.gov.co/observatorio/portal-de-datos/el-conflicto-en-cifras/masacres/

### Rutas del Conflicto — supplement / cross-validation

- 730 massacres, **1982–2012**, frozen 2014 compilation built with CNMH and Verdad Abierta —
  **not updated to present**. [high, 2-1 + 3-0]
- Per-event: date, departamento, municipio, vereda, armed group responsible (paramilitares,
  guerrilla, fuerza pública, Bacrim, no identificado). Methodology: Justice & Peace hearings,
  judicial sentences, press, CINEP Noche y Niebla. [high, 3-0]
- Role: cross-validation of CNMH 1982–2012 and rich per-event narratives to link to.
- Source: https://rutasdelconflicto.com/masacres

### UCDP GED — supplement, 1989+

- v25.1: organized violence **1989–2024**. CSV/Excel/RDS/Stata, free, no registration,
  **CC BY 4.0** (web display fine with citation). [high, 3-0]
- Limits: only events with ≥1 direct death, only dyads in conflicts crossing 25 battle deaths/yr —
  misses low-intensity and fatality-free violence. [high, 3-0]
- **⚠ Coordinate precision varies** — claim of village-level precision suitable for point
  mapping was **refuted 0-3**. Use its precision codes; don't assume coordinates. [refuted]
- No 1980–1988 coverage.
- Source: https://ucdp.uu.se/downloads/

### ACLED — not recommended

- Colombia coverage only **2018+**. [high, 3-0]
- Restrictive EULA: mandatory prominent attribution incl. on visualizations, prohibition on
  datasets/products/platforms that compete or substitute, no third-party services without
  authorization, access revocable. Poor fit for an open public web map. [high, 3-0]
- Sources: https://acleddata.com/terms-use ; https://acleddata.com/knowledge-base/country-time-period-coverage/

## Election data (Chamber, Senate, Presidential)

### CEDE / Universidad de los Andes — PRIMARY CANDIDATE

- **Panel Municipal del CEDE**: 1993–2023, municipal level, includes a *conflicto y violencia*
  module (attacks, kidnappings, homicides…) alongside governance/education/health — enables a
  single-source municipal join of conflict + context variables. Open Dataverse
  (DOI 10.57924/BN57KJ). [high, 3-0]
- **Electoral results repository**: companion ~128-database collection, **1958–2023**, councils
  through Presidency. [high, 3-0]
- **Partidos Políticos en Colombia**: classification of all parties/movements/coalitions
  1958–2022 (DOI 10.57924/XNHDBQ); caveat "para las cuales hay registro". [high, 3-0]
- **Access tiers**: (i) public after free registration, (ii) restricted to Uniandes users,
  (iii) on-site processing room. External requests: datoscede@uniandes.edu.co. The municipal
  panel is on the open Dataverse. [high, 3-0]
- Source: https://datoscede.uniandes.edu.co/

### Registraduría (incl. CEDAE portals)

- Portals fetched (cedae.registraduria.gov.co, estadisticaselectorales.registraduria.gov.co,
  observatorio.registraduria.gov.co) but few claims survived verification. Machine-readable
  municipal results for the pre-1993/pre-1997 era remain **unresolved**. [open question]

## Join feasibility & feasible window

| Era | Violence (event-level) | Elections (municipal) |
|---|---|---|
| 1980–1988 | CNMH only (Rutas from 1982) | unresolved — likely gaps |
| 1989–1992 | CNMH + UCDP | unresolved — likely gaps |
| **1993–present** | **CNMH + UCDP (+ Rutas to 2012, ACLED 2018+)** | **CEDE panel + electoral repo** |

- Robust joint window at municipio level: **~1993–present** [medium — derived, not single-sourced].
- Violence alone reaches back to 1982 (Rutas) / earlier (CNMH).
- Departamento-level elections pre-1993 may be recoverable from CEDE's 1958–2023 repository —
  needs hands-on check.

## Empirical audit — 2026-06-05 (supersedes estimates above)

Hands-on download and column audit of the actual files (see `pipeline/download_cnmh.py`,
`pipeline/download_cede.py`, `pipeline/audit_raw.py`; manifests in `data/raw/*/manifest.json`).
These findings OVERRIDE the web-research conclusions where they conflict.

### What was downloaded (2.1 GB in `data/raw/`)

- **CNMH SIEVCAC** — all 11 modalities × casos/víctimas × two cuts (44 files):
  - `socrata` family: native datos.gov.co tables, corte 2024-09-30, **CC BY-SA 4.0**.
  - `geoportal` family: CNMH ArcGIS Geoportal export, corte **2026-03-31** (current),
    license not stated on the federated entries. Richer schema (armed groups 1–3,
    civilian/combatant split, exact dates, Fecha_actualizacion).
- **CEDE Resultados Electorales** (DOI 10.71590/R2KLKI, **CC0 1.0**, anonymous download):
  camara/senado/presidencia, **every election 1958–2022**, candidate-level, `.tab` all years +
  `.dta` originals ≤1990, + Diccionario_electorales.pdf + Partidos_Electorales.dta.
- **CEDE Panel Conflicto y Violencia** (DOI 10.57924/BN57KJ, **CC0 1.0**) + codebook PDF.
- **UCDP GED Colombia** (HDX): 14,619 events 1989–2024, CSV.

### Resolved open questions

1. **DIVIPOLA keying — RESOLVED, better than hoped.** CNMH ships 5-digit DANE codes
   (`Geo_municipio` / `Código DANE de Municipio`; nulls ≤75 per file) AND complete coordinates
   (0 nulls in every geoportal casos file). CEDE ships `codmpio` (modern DANE) plus
   `codmpio_anti`/`coddpto_anti` legacy-code crosswalk columns. UCDP has names only
   (`adm_1`/`adm_2`) but coordinates with precision codes: 93% of events are municipality-level
   or better (`where_prec` ≤ 3).
2. **Pre-1993 municipal elections — RESOLVED, AVAILABLE.** The CEDE repository is
   municipio-level back to 1958 (832 municipios in 1958 → 1,188 in 2022, tracking real
   municipality creation; negligible null codes; vote totals historically plausible).
   **The "~1993 feasible window" estimate above is obsolete — the joint window is 1958–present.**
   Apparent series gaps (no senado/presidencia 1964, 1968) match the real electoral calendar
   (mitaca midterms), not missing data.
3. **License for CNMH — RESOLVED 2026-06-10**: the 2024-09-30 socrata cut is explicitly
   CC BY-SA 4.0. The 2026-03-31 geoportal cut (the one the frontend ships) states
   **CC BY 4.0** on every AGOL item (`licenseInfo`, verified 2026-06-10; evidence in
   `docs/evidence/cnmh-agol-license-2026-06-10.json`) — attribution required, no
   ShareAlike. datos.gov.co portal terms additionally request the citation
   "Fuente: Portal de Datos Abiertos www.datos.gov.co" + last-update date for
   datasets fetched there (applies to the DIVIPOLA centroids).

### Municipality centroids — MinSalud DIVIPOLA (added 2026-06-05)

- **Dataset**: "MinSalud Divipola - Municipios", datos.gov.co id `pqwj-3fi4`,
  **CC BY-SA 4.0**, attribution Ministerio de Salud y Protección Social. 1,122 municipios:
  5-digit DANE code + name + centroid lat/lon, zero nulls. Fetched by
  `pipeline/download_divipola.py`.
- **Encoding gotchas**: the Socrata CSV export is corrupted at source (accents → U+FFFD,
  unrecoverable); the SODA JSON endpoint serves recoverable double-encoded UTF-8. The
  script fetches JSON and repairs mojibake per field.
- Used as the anchor for municipio-level election points.

### Municipality polygons — DANE MGN (added 2026-06-05)

- **Dataset**: Marco Geoestadístico Nacional, nivel municipio (`MGN_MPIO_POLITICO`),
  vintage **MGN2023**, direct zip from the DANE Geoportal
  (`geoportal.dane.gov.co/descargas/mgn_2023/MGN2023_MPIO_POLITICO.zip`, 68 MB shapefile,
  EPSG:4686). Open download with DANE attribution. Fetched by `pipeline/download_mgn.py`
  (sha256 manifest); 2022 and 2024 vintages verified available at the same URL pattern.
- **Join**: `mpio_cdpmp` = 5-digit DANE code. Coverage vs DIVIPOLA centroids: MGN has
  **La Guadalupe (94885)** with no centroid row; DIVIPOLA has **Belén de Bajirá (27086)**
  and **Mapiripaná (94663)** with no MGN2023 polygon. All recorded in
  `munis_shapes.json.meta`, rendered as no-data / centroid-only.
- **Simplification**: `shapely.coverage_simplify` (topology-preserving, tolerance 0.004°),
  5.9M → 111k vertices, 2.1 MB GeoJSON. Params in the artifact meta.

### CEDE `fecha_eleccion` errors (discovered 2026-06-05)

The per-file election date column is wrong on several files — it carries the date of the
*other* election of the same year. All values verified against the historical record;
corrections live in `DATE_OVERRIDES` (build_frontend_data.py), each with a citation:

| File | CEDE value | Correct | Note |
|---|---|---|---|
| 1958 presidencia | 16 mar 1958 | **1958-05-04** | CEDE carries the congressional date |
| 1978 presidencia | 26 feb 1978 | **1978-06-04** | idem |
| 1990 cámara | 27 may 1990 | **1990-03-11** | CEDE carries the presidential date (senado file is correct) |
| 2010 cámara+senado | 30 may 2010 | **2010-03-14** | presidential first-round date |
| 2014 cámara+senado | 25 may 2014 | **2014-03-09** | idem |
| 2022 senado | 25 may 2022 | **2022-03-13** | value matches no 2022 election (cámara file is correct) |
| 1991 cámara+senado | 27 oct 1991 | *confirmed correct* | special post-Constitution election; outside the usual Feb–Apr window |

### 1962 presidencia anomaly (documented 2026-06-05)

- CEDE's principal constituency for 1962 contains only Conservador-banner votes (1.94M ≈
  Valencia 1.63M + dissident Leyva 0.31M). The anti-FN candidacies (~683k votes, incl.
  López Michelsen's MRL 625k and Rojas Pinilla's 55k) are recorded **in the source itself
  as `VOTOS NULOS`** (codigo_partido null, nombres="VOTOS NULOS") — consistent with the
  Frente Nacional alternation rules that voided non-Conservative candidacies that year.
  The pipeline's partyless-row exclusion handles them; nothing is patched.

### Memoria view: party left–right scores (added 2026-06-05)

- **Table**: `pipeline/party_lr.py` — 86 parties/coalitions on a 5-point scale
  (−1…+1), one citation per row; departmental coalitions without a direct row get
  the **continuous mean of their citably-scored members** (members without a score
  are omitted from the mean — disclosed in the method note).
- **National coverage of party-attributed votes** (computed 2026-06-05, exact
  pipeline logic): median **99.5%**; below 85% in exactly three elections —
  cámara 1991 **71.6%** (CEDE's own `PARTIDO DESCONOCIDO PARA EL AÑO 1991` bucket
  = 24% of votes), senado 2002 **80.3%**, cámara 2002 **83.8%** (party-system
  fragmentation into unscorable micro-vehicles). Per-municipio coverage ships in
  `memoria.json`; municipios under 50% are dimmed in the UI.
- **Provenance**: drafted by a multi-source cited research pass (5 parallel researchers,
  2026-06-05; raw output `pipeline/_lr_research_result.json`), consolidated by
  `pipeline/_gen_party_lr.py` with three documented adjudications (MUM, Centro
  Esperanza, Equipo por Colombia) plus one deliberate override of a researcher
  verdict: `COALICIONES DE 1982` was researched as an unscorable aggregation bucket,
  but the code appears **only** in the 1982 presidencia file (verified) where it is
  Betancur's coalition candidacy → scored +0.5 with that basis on the row.
  **Pending scholarly review by the project owner before public citation.**
- Unscorable parties (regional/personalist vehicles, CEDE aggregation buckets like
  `PARTIDO DESCONOCIDO PARA EL AÑO 1991`, 1.4M votes) are excluded from numerator and
  denominator — never guessed. Department-level `COALICION CAMARA/SENADO.` lists get
  the mean of matched constituent parties (documented derivation rule).

### SIEVCAC modality classification caveat (discovered 2026-06-05)

- **Bojayá (2002-05-02, 81 victims) is not in the Masacres modality** — SIEVCAC codes
  it under Acciones Bélicas (combat action, launched explosive). The memoria view's
  massacre layer follows the source's own taxonomy; iconic events classified as combat
  actions will not appear as wounds. Mapiripán (1997-07-15, 35) and El Salado
  (2000-02-16, 60) are in MA and verified against the record.

### AB `Presunto_Responsable` is NOT a perpetrator (discovered 2026-06-24)

- For **AB (Acciones Bélicas / combat)**, the geoportal cut's `Presunto_Responsable`
  is literally `Grupo_Armado_1` (verified: 99.99% identity). `Grupo_Armado_1` is the
  **first-listed combat party — for guerrilla/paramilitar assaults on the security
  forces that is the ATTACKED force, not the aggressor.** Across the shipped AB slice,
  36,123/38,907 rows (93%) read `AGENTE DEL ESTADO`, of which 29,799 are
  `GA1=AGENTE DEL ESTADO + GA2=GUERRILLA` — i.e. ~30k FARC/ELN attacks on the army that
  the flattened field would mislabel as state-perpetrated. **Never display the AB
  `Presunto_Responsable` as "responsable".**
- The honest AB model is the multi-actor combat record: `Grupo_Armado_1/2/3` (the
  parties), `Iniciativa` (which side took the offensive), and the casualty split
  (`Total_victimas_civiles` vs `Total_combatientes`). The "victims" of AB rows are
  overwhelmingly **combatants** (e.g. Gutiérrez 13340: 55 dead = 17 soldiers + 38 FARC;
  civilians ≈ 0 across the combat tail). `Iniciativa` and the specific second-group
  name (e.g. FARC) live **only in the 2024-09-30 socrata cut (CC BY-SA)** — the
  geoportal cut has `Grupo_Armado_2` at category level but no `Iniciativa` and no GA2
  description. The build joins them by `IdCaso` (98.7% of AB rows; newer rows → SIN
  INFORMACIÓN, never imputed). Frontend renders AB as participants + initiative, with
  the civ/combatant split in the portrait. See `meta.abParticipants` and the `ga2`/
  `grp2`/`initiative` buffers.

### CEDE .tab encoding (discovered 2026-06-05)

- The Dataverse-ingested `.tab` files have **irrecoverably corrupted accents**
  (each non-ASCII byte → U+FFFD). Affects `departamento`/`municipio` name columns and
  one 1998 candidate name; does NOT affect any code column, vote counts, or party-name
  strings (checked all 61 files). Pipeline mitigations: department names from a canonical
  DANE table; municipality names from DIVIPOLA; codes used everywhere else.
- `codigo_partido` columns are **inconsistently typed across files**: some carry the
  party NAME string (label-materialized), others the numeric code — the pipeline maps
  numeric codes through `Partidos_Electorales.dta` value labels (read with
  `convert_categoricals=False`; labels are non-unique).
- Votes abroad appear as pseudo-municipios `codmpio` 9000–9999, `departamento`
  = CONSULADOS — excluded from the municipal map, counted per election.

### CNMH placeholder coordinates (discovered 2026-06-05)

- Events with unknown municipality (`Geo_municipio` null/0/`XX000`) carry the
  **department centroid** as coordinates (verified: one unique coord pair per
  department). Plotting them would fabricate spatial precision → the pipeline excludes
  them and counts them per modality (`excluded.noMunicipio`, 5,489 events 1958+).

### Remaining caveats

- **Unknown-year events**: `Anio_hecho = 0` records in CNMH — negligible for most modalities
  but 65% of reclutamiento casos (11,232/17,280) and ~6% of desaparición forzada (3,985).
  Keep as null dates; exclude from temporal views, never impute.
- **Senate post-1991** is national-circunscription: files explode to 0.3–2M rows
  (candidate × municipio). Aggregation strategy needed in pipeline.
- **DIVIPOLA temporal stability** (municipality splits since 1958): CEDE's `codmpio_anti`
  crosswalk plus DANE's DIVIPOLA reference handles this; validate during the join build.

## Refuted claims (do not cite)

- "CNMH conflict datasets are CC BY 4.0" — 0-3. *(Superseded 2026-06-10 for the geoportal
  cut specifically: per-item `licenseInfo` = CC BY 4.0, see resolution note above. The
  blanket claim remains wrong — the socrata cut is CC BY-SA 4.0.)*
- "UCDP GED has village-level precise coordinates suitable for web mapping" — 0-3.
- "SIEVCAC strictly requires registration (no open path)" — 1-2 split; registration is the
  documented official path but mirrors may exist.
- "UCDP GED is the more reliable option than ACLED for subnational analysis" — 1-2; treat
  Eck (2012) comparison as descriptive, not a settled superiority ranking.
