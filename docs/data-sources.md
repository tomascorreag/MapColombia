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
- **⚠ License UNVERIFIED**: claim that CNMH data is CC BY 4.0 was **refuted 0-3**. Reuse
  terms for public web display must be confirmed before publishing. [open question]
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
3. **License for CNMH** — partially resolved: the 2024-09-30 socrata cut is explicitly
   CC BY-SA 4.0 → safe to publish with attribution + share-alike. The 2026 geoportal cut's
   terms remain unstated; if it's displayed, confirm terms or fall back to the licensed cut.

### Municipality centroids — MinSalud DIVIPOLA (added 2026-06-05)

- **Dataset**: "MinSalud Divipola - Municipios", datos.gov.co id `pqwj-3fi4`,
  **CC BY-SA 4.0**, attribution Ministerio de Salud y Protección Social. 1,122 municipios:
  5-digit DANE code + name + centroid lat/lon, zero nulls. Fetched by
  `pipeline/download_divipola.py`.
- **Encoding gotchas**: the Socrata CSV export is corrupted at source (accents → U+FFFD,
  unrecoverable); the SODA JSON endpoint serves recoverable double-encoded UTF-8. The
  script fetches JSON and repairs mojibake per field.
- Used as the anchor for municipio-level election points. The DANE MGN polygon download
  (for choropleths) remains pending.

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

- "CNMH conflict datasets are CC BY 4.0" — 0-3.
- "UCDP GED has village-level precise coordinates suitable for web mapping" — 0-3.
- "SIEVCAC strictly requires registration (no open path)" — 1-2 split; registration is the
  documented official path but mirrors may exist.
- "UCDP GED is the more reliable option than ACLED for subnational analysis" — 1-2; treat
  Eck (2012) comparison as descriptive, not a settled superiority ranking.
