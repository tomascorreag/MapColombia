# Annotation curation workflow

How "Read more…" event annotations get researched, gated, recorded, and shipped.
The **contract** (the exact-one-`IdCaso` gate + merge policy) is in
[`event-annotations.md`](event-annotations.md); this file is the **operational
procedure** and the tooling.

## Two layers: search (agent) vs. match (script)

A plain script cannot web-search, so curation is deliberately split:

```
  ┌─ SEARCH (agent / human) ─────────┐   ┌─ MATCH (pipeline/match_event.py) ──────┐
  │ find a well-documented event,    │   │ resolve facts -> exactly one IdCaso,   │
  │ extract date/place/count/perp +  │──▶│ enforce the gate, detect conflicts,    │
  │ ≥3 sources, draft bilingual prose│   │ record a candidate, propose merge mode │
  └──────────────────────────────────┘   └────────────────────────────────────────┘
        writes pipeline/annotation_seeds.json        writes pipeline/annotation_candidates.json
                                                                    │
                                          owner verifies ──▶ promote ──▶ data/processed/frontend/annotations.json
```

The script is the **reproducible, deterministic** half — it reads the same raw
geoportal cut the binary is built from (`data/raw/cnmh/manifest.json`) and
replicates `build_frontend_data.py`'s keep-filter, so any matched `IdCaso` is
guaranteed to exist in `violence.bin` (otherwise the button could never appear).

## Files

| File | Role |
|---|---|
| `pipeline/annotation_seeds.json` | **input** — agent-authored events + facts + drafted prose + sources |
| `pipeline/match_event.py` | the gate engine: `resolve` / `match` / `promote` / `validate` |
| `pipeline/annotation_candidates.json` | **staging** — every seed's match outcome + conflicts (review queue; not served) |
| `data/processed/frontend/annotations.json` | **served** — only owner-promoted entries; loaded by the app |

## Seed schema

```jsonc
{
  "key": "el-salado",          // stable slug
  "modality": "MA",            // SIEVCAC modality code — which casos_<MOD> file
  "municipioDane": 13244,      // DANE/DIVIPOLA code (use `resolve` to find it)
  "date": "2000-02-16",        // ISO; may be partial "YYYY" / "YYYY-MM"
  "victims": 60,               // figure asserted by sources — cross-checked vs coded
  "responsibleHint": "PARAMILITAR",  // optional; matched against coded perpetrator
  "disputedFigures": true,     // optional; force review when sources disagree among themselves
  "disputeNote": "CNMH-coded 60 vs Fiscalía-2008 estimate >100",
  "title":     { "es": "...", "en": "..." },
  "narrative": { "es": "...", "en": "..." },   // prose must never state a count/date/perp that contradicts the coded row
  "sources": [ { "type": "primary|scholarship|tertiary", "publisher": "...", "title": "...", "url": "..." } ]
}
```

`modality` is **not** guessable — see the Bojayá lesson below. If `match` returns
`no_match`, the event is very likely under a different modality.

## Commands

```bash
# 1. find a municipio's DANE code while authoring a seed
python pipeline/match_event.py resolve "El Carmen de Bolivar" --dept "Bolivar"
#   13244  El Carmen De Bolívar — Bolívar

# 2. run the gate over every seed -> writes pipeline/annotation_candidates.json
python pipeline/match_event.py match
#   OK el-salado   IdCaso 290737 -> review_required  [1 conflict(s)]
#   OK bojaya      IdCaso 17896  -> review_required  [2 conflict(s)]
#   OK chengue     IdCaso 439556 -> review_required  [1 conflict(s)]

# 3. owner reads the candidate, verifies, then promotes ONE key into annotations.json
python pipeline/match_event.py promote --key el-salado --reviewer "Owner" --date 2026-06-22
#   --reviewer/--date are REQUIRED for review_required candidates (sign-off);
#   auto candidates promote without them.

# 4. guard (run in CI / before build): re-check shipped entries against the gate
python pipeline/match_event.py validate          # exit 1 only on BROKEN entries
python pipeline/match_event.py validate --strict # also fail on PENDING (unsigned) entries
```

## Match outcomes

Per seed, `match` records one of:

| status | meaning | action |
|---|---|---|
| `matched` | exactly one kept `IdCaso` resolved | candidate written; `mergeSuggestion` = `auto` or `review_required` |
| `ambiguous` | ≥2 rows survive the seed's keys | rejected; `candidateIdCasos` listed — sharpen the date/count/perpetrator |
| `no_match` | no kept row in that municipio+year | rejected — wrong modality/municipio/year, or excluded by the build |

`mergeSuggestion` is `auto` only when: matched **and** ≥3 authoritative sources
(`primary`/`scholarship`) **and** zero conflicts. Conflicts the script detects:

- **victims** — `seed.victims` ≠ coded `Total_Victimas_Caso` (report the coded value).
- **responsible** — `responsibleHint` not found in the coded perpetrator.
- **disputedFigures** — editorial flag for source-vs-source disagreement the machine can't see.

Any conflict → `review_required` → owner must sign off (`--reviewer`/`--date`) to promote.

## Worked example (the three seeds shipped in this repo)

| Seed | Result | Why |
|---|---|---|
| **El Salado** | matched `290737`, review_required | `disputedFigures`: CNMH 60 vs Fiscalía-2008 >100 |
| **Bojayá** | matched `17896`, review_required | count 79 vs coded 81; **and** coded perpetrator `GRUPO PARAMILITAR` ≠ stated `GUERRILLA` |
| **Chengue** | matched `439556`, review_required | count 27 vs coded 30; only 2 authoritative sources |

### The Bojayá lesson (why the gate refuses to guess)
The Bojayá seed first assumed `modality: "MA"` (massacre). `match` returned
`no_match` — there is **no** masacre row for Bojayá (DANE 27099) in 2002. A
cross-modality scan found the event coded under **`AB` (Acciones bélicas)** as
`IdCaso 17896` (81 victims), because the cylinder-bomb killing occurred during
combat, not a line-up massacre. The gate correctly refused to attach the
narrative to a wrong row; the fix was to correct the seed's modality, not to
loosen the match. **When `match` says `no_match`, re-scan modalities before
assuming the event is absent.**

## Integrity rules (enforced or required)

- A matched `IdCaso` is guaranteed in `violence.bin` (same keep-filter as the build).
- `narrative` prose must not state a victim count, date, or perpetrator that
  contradicts the coded row; divergent figures appear only with source attribution.
  (The script can't read prose — this is the reviewer's responsibility.)
- Nothing reaches `annotations.json` except via `promote`; `review_required`
  entries require an explicit `--reviewer`/`--date` sign-off. Dates are never
  auto-stamped (CLAUDE.md: reproducible, owner-attributed editorial acts).
- `validate` is the CI guard: BROKEN (IdCaso absent / auto with <3 sources) fails
  the build; PENDING (unsigned) warns by default, fails under `--strict`.
