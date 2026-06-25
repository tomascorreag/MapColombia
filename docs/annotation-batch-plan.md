# Batch seed-authoring plan

Scope for running agents at volume to populate `pipeline/annotation_seeds.json`,
feeding the existing gate (`docs/annotation-curation.md`). This is the **search**
layer scaled up; the match/promote/validate machinery is unchanged.

## Strategy: data-first

Seed from the **shipped binary**, not a web list. Rank `violence.bin` rows by
`Total_Victimas_Caso`, take the top N, and hand each agent the CNMH-coded packet:

```
{ idCaso, modality, municipioDane, municipio, departamento, date, codedVictims, codedResponsible }
```

Because the `IdCaso` is known, there is no resolution step — no `ambiguous`, no
`no_match` (the Bojayá failure mode is impossible). The agent *corroborates* a
known event instead of finding-then-matching. Modality/municipio/date are correct
by construction.

## Candidate universe (measured from violence.bin)

| victims ≥ | events | modality mix (≥15: AB 263 · MA 117 · SE 65 · DF 49 · AP 21 · AT 10 …) |
|---|---|---|
| 100 | 13 |
| 50 | 31 |
| 30 | 106 |
| 20 | 278 |
| 15 | 538 |
| 10 | 1238 |

Victim count is a proxy for documentability, not a guarantee — high-count
`SE`/`DF` rows may be aggregates with no distinct coverage. Agents return an
explicit *insufficient-coverage* verdict rather than forcing a draft.

## Per-event pipeline (pipeline() over the candidate rows)

```
stage 1  FIND     given the coded packet, web-search the event; collect ≥3
                  authoritative sources (CNMH / CdV / JEP / Fiscalía / Rutas del
                  Conflicto / Verdad Abierta / scholarship). For each source,
                  confirm it describes THIS event (date ± a few days, municipio,
                  victim count in range). Draft bilingual narrative attributing
                  every figure to a source, never contradicting the coded values.
                  Output a seed object — OR verdict "insufficient" (no draft).

stage 2  VERIFY   adversarial second agent: given draft + sources + coded packet,
                  try to REFUTE that the narrative describes the coded event;
                  flag any unsourced claim, embellishment, or figure that
                  contradicts the coded row. Verdict real / not + reasons.
```

Confirmed seeds are merged into `annotation_seeds.json`; `match` then runs as a
pure consistency check (it will flag count/perpetrator conflicts vs the coded row,
exactly as it does today), producing the candidate review queue.

## Integrity controls

- **Anchor on the coded row.** The agent corroborates `IdCaso`; it never picks
  which row an event is.
- **≥3 authoritative sources** (`primary`/`scholarship`) or the event is dropped,
  not drafted. Tertiary (press/Wikipedia) may corroborate but never satisfy the floor.
- **Adversarial verify pass** before a seed is accepted — refute-by-default.
- **Prose attributes figures**; the coded count/date/perpetrator are authoritative,
  divergent figures appear only with attribution (the match step flags conflicts).
- **Owner is the final gate.** Nothing ships without `promote --reviewer`. No
  auto-promote in the first tiers regardless of `mergeSuggestion` — auto is
  reconsidered only once owner spot-checks establish the hit quality.
- **No silent caps.** The run logs every dropped event (insufficient coverage,
  refuted) so "covered the tier" never hides skipped events.

## Cost & phasing (rough — output-token order of magnitude)

Per event ≈ a finder agent (multi-search + fetch + draft) + a verify agent ≈
**~75k output tokens**, plus large search-result input. So:

| tier | events | ≈ output tokens | recommendation |
|---|---|---|---|
| pilot (≥100) | 13 | ~1M | **start here** — measure hit rate + quality |
| ≥30 | 106 | ~8M | scale here only after pilot |
| ≥15 | 538 | ~40M | full sweep; only if pilot yield justifies it |

The **pilot's job is to measure the unknown**: what fraction of the tier has ≥3
authoritative sources, and whether the drafted quality passes owner spot-check.
Extrapolate cost/yield from that before committing to the ≥30 / ≥15 tiers.

## Pilot results (≥100 tier, 13 events — measured)

Run `wf_a84de189`: **4 confirmed, 9 dropped** (31% hit), 17 agents, ~480k tokens,
~3.8 min → **~37k tokens/event** (half the pre-estimate; dropped events bail fast
once no coverage is found). Revised tier cost: ≥30 ≈ **4M**, ≥15 ≈ **20M** tokens.

- **Confirmed**: La María church mass-kidnapping (ELN, `335679`), Toma de
  Miraflores (FARC, `320626`), Masacre de Tacueyó / Ricardo Franco internal purge
  (`288776`), Avianca Flight 203 bombing (`185271`). All `review_required`.
- **Dropped (integrity win)**: mostly high-victim `AB` *acciones bélicas* — aerial
  operations (Fuerza Aérea) and battles ("Combate de Tamborales") where the count
  includes combatants and no atrocity narrative exists — plus events with genuinely
  no published coverage. Agents refused to draft rather than fabricate.
- **Lesson — victim-count tiers are contaminated by combat events.** The ≥100 tail
  is ~half battles/bombings. Hit rate among *atrocity/kidnapping-type* rows was far
  higher (4 of ~5). Don't pre-filter by perpetrator (would bias away from
  state-attributed violence); let the coverage test drop them, as it did.

### Refinements before scaling
- Instruct finders to emit a **coarse `responsibleHint`** matching CNMH's category
  vocabulary (e.g. "ELN" not "ELN (Frente José María Becerra)") — richer hints trip
  a benign responsible-conflict flag against the broad coded category.
- Ultra-documented events can fall just under the 3-authoritative floor on source
  *classification* (Avianca 203 cleared with 2). Owner may add one primary source
  on review, or accept it — but keep the floor; don't auto-relax it.

## Scale lesson: batch size vs. session limit (run wf_5ec7b27d)

The first ≥30 attempt ran all 93 events at once and **hit the account session
rate limit mid-run** (Opus, FIND+VERIFY both high-cost): 121 agents, ~2.6M tokens,
then the limit killed the back half. Outcome: 41 genuine `insufficient_coverage`
rejections (mostly combat `AB` rows — as predicted), 28 events drafted but their
VERIFY could not run, ~24 threw in FIND under the failing limit. `confirmed: 0` was
an **artifact of the limit, not a coverage result**.

Fixes applied:
- **Assembly bug**: a draft whose VERIFY fails to *run* (infra/limit) is no longer
  discarded as "refuted" — it is kept as an unverified `review_required` candidate
  (the owner is the backstop). Genuine verify *refutals* are still dropped.
- **Batch sizing**: cap a run at **~20 events** to stay within one session window;
  run tiers as several sequential batches, not one fan-out.
- **Model split (future fresh batches)**: FIND on a cheaper model (web-search +
  draft), VERIFY on the high-effort model. Halves burn. (Do NOT change models on a
  *resume* — it invalidates the agent cache.)
- **Recovery**: `Workflow({scriptPath, resumeFromRunId})` after the limit resets —
  cached FIND/VERIFY results return free; only the failed agents re-run.

## Execution

A `Workflow` run (opt-in, billable): build the candidate packet from the binary
→ `pipeline()` FIND→VERIFY over the rows → write confirmed seeds + a dropped-event
log → owner runs `match` and reviews the candidate queue. Launched only on
explicit go-ahead with a chosen tier.

## Next-session runbook (remaining ≥30 tier, batched)

49 events remain (≥30 victims, minus the 7 seeded and 50 rejected). Pre-built as
**3 self-contained batch scripts** (~17 events each, FIND on Sonnet, VERIFY on
Opus/high) committed at `pipeline/batch_workflows/annotation-batch-{1,2,3}.js`.
Run **one batch per session window** (avoids the rate limit that killed the 93-at-once
run). The remaining-event list is `pipeline/annotation_remaining.json`.

Per batch:
```bash
# 1. launch (returns a task id; completes in background, ~8-12 min)
#    Workflow({ scriptPath: "pipeline/batch_workflows/annotation-batch-1.js" })   # absolute path

# 2. when it completes, merge its result into the pipeline (one command):
python pipeline/match_event.py ingest --result <task .output path>
#    -> appends confirmed + unverified drafts to annotation_seeds.json,
#       genuine rejections to annotation_dropped.json (idempotent; infra-failures left for re-run)

# 3. run the gate over all seeds -> refreshed review queue with conflict flags
python pipeline/match_event.py match

# 4. owner reviews pipeline/annotation_candidates.json and signs off the trusted ones:
python pipeline/match_event.py promote --key <slug> --reviewer "Owner" --date <ISO>
```
`_unverified: true` seeds are drafts whose adversarial VERIFY could not run — they
still enter the queue as `review_required`; the owner is the backstop. Re-running
that event in a later batch (it stays out of the seed file only if dropped) would
re-verify it, but owner sign-off already covers it.

Expect ~half of each batch (the `AB` combat rows) to drop as `insufficient_coverage`
— that is correct, not failure.

## Batch execution log (≥30 tier)

| batch | run | events | confirmed | dropped | tokens | notes |
|---|---|---|---|---|---|---|
| 1 | wf_976a353f | 17 | 11 | 6 | ~1.0M | 65% hit (mid-tier better-documented than ≥100 pilot). No rate-limit. Highlights: Machuca (203134), DAS bombing (185290). |
| 2 | wf_d20c8bb1 | 17 | 5 | 12 | ~0.93M | 26% hit (combat-heavy slice). Highlights: La Chinita (439482), Mapiripán (290078). |
| 3 | wf_be9565ad | 15 | 4 | 11 | ~0.83M | 27% hit (AB/DF/SE-heavy slice). Highlights: Puerres ambush (10136), Playón de Orozco / coded under Pivijay (290403). |

**≥30 tier COMPLETE (2026-06-23).** Three batches, 49 events → **20 confirmed,
29 dropped** (41% overall). ~2.8M tokens total, no rate-limit hit (one-batch-per-window
held). Queue now: **27 candidates** (7 prior + 20 from batches 1–3), 0 `no_match`
across all runs (data-first pinning held). `mergeSuggestion`: **2 `auto`**
(`cali-442456`, `tibu-292102`), **25 `review_required`**. Dropped log: 79 entries.
The one-batch-per-window cap has margin; the original failure was the 93-at-once
fan-out, not per-batch cost.

**Recurring `AB` responsible-quirk** (El Billar 12133/12148, Gutiérrez 13340, Puerres
10134): CNMH codes responsible as `AGENTE DEL ESTADO / EJÉRCITO` for FARC assaults on
military units — the code names the **victims' force**, not the attacker. The drafted
narratives correctly name FARC; owner should confirm this reading before promoting.

**Promotion status (2026-06-24):** Owner signed off **25 of 27** candidates →
`annotations.json` (23 `review_required` + 2 `auto`, reviewer "Owner"). Three
duplicate pairs were deduped to a shared payload before promotion: Playón de
Orozco (290403/439514), El Billar (12133/12148), Puerres (10134/10136) — both
keys carry one canonical narrative. The five AB combat candidates were promoted
as-is (already combat-framed; the AB `Presunto_Responsable` mislabel was fixed at
the display layer — see docs/data-sources.md). Bojayá (AB, civ=81) drove a
follow-up: the AB narrative is now **civilian-aware** — when an AB row's dead are
civilian it reads "…en la que murieron N civiles" (massacre-during-combat) rather
than the neutral "dejó N muertos" used for all-combatant engagements; mixed rows
name the civilian portion. **Two not promoted:** cali-335679 (La María — 99/179/194
count spread needs an editorial lead figure), buenos-aires-434373 (La Balsa —
4-executed-vs-30-disappeared composition unsettled).

## Batch execution log (20–29 band, ≥20 tier)

The ≥20 tier's new work is the **20–29 victim band**: 278 events ≥20 minus the 106
already in the ≥30 tier = **172 events**, minus the 103 IdCasos already seeded/dropped.
Candidate packet ranked by victim count in `pipeline/annotation_band20.json`
(generator: scratchpad `gen_band20.py` — reuses `match_event.load_modality`'s
keep-filter). Mix is **AB-heavy (82/172, ~48%)**, so expect a lower hit rate than
the mid-≥30 batches — the AB combat rows drop on the coverage test, as designed.
Batch scripts continue the numbering (`annotation-batch-4.js` = top 18) and run
one per session window.

| batch | run | events | confirmed | dropped | tokens | notes |
|---|---|---|---|---|---|---|
| 4 | wf_3070d784 | 18 | 5 | 13 | ~0.93M | 28% hit (combat-heavy slice). Confirmed: El Tigre (290402, auto), La Mejor Esquina (288919), Puerto Rico/Meta police kidnapping (335976), Uribe-inauguration rockets (920112), Granada/Antioquia takeover (185328). 1 refuted (Guapi AB 34221 — finder misread its own source). granada narrative had the unsourced-60%-displacement + blast-scope claims fixed before promote. All 5 promoted (reviewer Owner, 2026-06-24). |

**Served annotations: 30** (25 prior + 5 batch-4). 154 of 172 band events remain.
