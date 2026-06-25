# Event annotations ("Read more…")

Curated, source-cited long-form narrative for **individual** violence events, attached
to the existing click panel via a *Read more…* button → modal. This is an **annotation
layer**, deliberately separate from the integrity-controlled pipeline binaries
(`violence.bin` / `violence_details.bin`). It never alters a coded value; it links out
from one.

## The hard gate: exact-one-`IdCaso`

An event qualifies for an annotation **iff** a well-sourced account can be tied to
**exactly one** CNMH `IdCaso`, and that case's coded facts are consistent with the
account.

`IdCaso` is shipped per row in `violence.bin` (the `id` uint32 buffer; surfaced in the
panel as `violence.id[gi]`). It is the join key and the stable annotation key across
rebuilds.

Why the gate is strict, demonstrated on El Salado: the municipality **El Carmen de
Bolívar (DANE 13244)** has **8 masacre rows in the year 2000 alone**. `(municipio, year,
modality)` is therefore ambiguous — 8 candidates. What collapses it to one is the three
orthogonal keys a good source supplies:

| Source pins | Excludes the other 7 rows via |
|---|---|
| 16 Feb 2000 | `Fecha_Hecho` |
| ~60 dead | `Total_Victimas_Caso` |
| AUC paramilitaries | `Presunto_Responsable` |

→ `IdCaso 290737`. Unequivocal.

If the disambiguation query leaves **≥2** candidate `IdCaso`, or the source lacks a full
date / victim count / named perpetrator, the event **fails the gate and is discarded** —
no forcing, no nearest-match.

## Merge policy

| Path | Condition | Action |
|---|---|---|
| **auto** | exact-one-`IdCaso` **and** ≥3 independent authoritative sources **and** no source conflicts each other **and** no source conflicts the row's coded facts (date / count / perpetrator) | merge without review |
| **review_required** | gate passes but a source disagrees with a coded fact, **or** sources disagree among themselves, **or** <3 sources | draft is written, held for human sign-off |
| **reject** | gate fails (≥2 IdCaso, or missing disambiguating keys) | not written |

"Authoritative" = CNMH, Comisión de la Verdad, JEP, Fiscalía, Rutas del Conflicto /
Verdad Abierta, Amnesty/HRW, peer-reviewed scholarship. Tertiary sources (Wikipedia,
general press) may corroborate but never satisfy the ≥3 alone.

**A victim-count discrepancy is a conflict, not a footnote.** It blocks auto-merge. The
narrative reports the *coded* value as the case figure and attributes any divergent
figure to its source — it never overrides the coded count. (El Salado is precisely this
case: row codes 60; Fiscalía 2008 estimated >100 → `review_required`, even though it is
the most-documented massacre in the corpus.)

## Format

One JSON object per event, keyed by `IdCaso` (string). Stored in
`data/processed/frontend/annotations.json` (built/validated by a curation script;
hand-edited entries are allowed here because this layer is editorial, not derived — but
every entry MUST carry its sources and merge record).

```jsonc
{
  "290737": {
    "idCaso": 290737,
    "match": {
      "modality": "MA",
      "municipioDane": 13244,
      "date": "2000-02-16",          // = row Fecha_Hecho (episode start)
      "codedVictims": 60,            // = row Total_Victimas_Caso
      "codedResponsible": "GRUPO PARAMILITAR / AUC",
      "candidatesInMuniYear": 8,     // how ambiguous (municipio,year,modality) was
      "disambiguatedBy": ["date", "victimCount", "responsible"]
    },
    "merge": {
      "mode": "review_required",
      "reason": "victim-count discrepancy: row=60, Fiscalía 2008 estimate >100",
      "reviewedBy": null,            // owner sets on sign-off
      "reviewedOn": null
    },
    "title": { "es": "Masacre de El Salado", "en": "El Salado massacre" },
    "narrative": {
      "es": "Entre el 16 y el 21 de febrero de 2000, cerca de 450 hombres de las Autodefensas Unidas de Colombia (AUC) —los bloques Norte y Héroes de los Montes de María— ocuparon el corregimiento de El Salado, en El Carmen de Bolívar (Bolívar). Durante casi seis días reunieron a los habitantes en la cancha y la plaza del pueblo y los torturaron y asesinaron, acusándolos de colaborar con la guerrilla. El registro del CNMH consigna 60 víctimas mortales en este caso; investigaciones posteriores de la Fiscalía (2008) elevaron la cifra a más de 100. La masacre, enmarcada en la expansión paramilitar en los Montes de María, provocó el desplazamiento de la mayoría de los pobladores y el abandono temporal del corregimiento. Comandantes como Úber Bánquez (alias «Juancho Dique») y John Jairo Esquivel (alias «El Tigre») fueron condenados en el proceso de Justicia y Paz.",
      "en": "Between 16 and 21 February 2000, some 450 men of the United Self-Defence Forces of Colombia (AUC) — the Bloque Norte and Bloque Héroes de los Montes de María — occupied the village of El Salado, in El Carmen de Bolívar (Bolívar). For nearly six days they gathered residents in the village square and football pitch and tortured and killed them, accusing them of collaborating with the guerrillas. The CNMH registry records 60 fatal victims in this case; a later prosecutorial investigation (Fiscalía, 2008) put the toll above 100. The massacre, part of the paramilitary expansion across the Montes de María, displaced most of the population and emptied the village for a time. Commanders including Úber Bánquez (alias 'Juancho Dique') and John Jairo Esquivel (alias 'El Tigre') were convicted under the Justice and Peace process."
    },
    "sources": [
      {
        "type": "primary",
        "publisher": "Centro Nacional de Memoria Histórica (CNMH)",
        "title": "La masacre de El Salado: esa guerra no era nuestra (informe, 2009) / «El Salado: memoria, retorno y resistencia comunitaria»",
        "url": "https://centrodememoriahistorica.gov.co/el-salado-memoria-retorno-y-resistencia-comunitaria-a-26-anos-de-la-masacre/"
      },
      {
        "type": "primary",
        "publisher": "Comisión de la Verdad",
        "title": "Comisión de la Verdad propicia acto de reconciliación entre víctimas y responsable de la masacre de El Salado",
        "url": "https://web.comisiondelaverdad.co/actualidad/noticias/comision-verdad-propicia-acto-perdon-entre-victimas-responsable-de-masacre-salado"
      },
      {
        "type": "primary",
        "publisher": "Amnesty International",
        "title": "Colombia: Human Rights and USA Military Aid to Colombia III (AMR 23/030/2002)",
        "url": "https://www.amnesty.org/es/wp-content/uploads/2021/06/amr230302002en.pdf"
      },
      {
        "type": "scholarship",
        "publisher": "Revista Eidos / SciELO Colombia",
        "title": "La masacre de El Salado como paradigma de violencia soberana paramilitar",
        "url": "http://www.scielo.org.co/scielo.php?script=sci_arttext&pid=S1692-88572020000300161"
      }
    ]
  }
}
```

### Field rules
- `narrative` is **developer/curator-authored bilingual prose**, same provenance class as
  `Credits.svelte` and `party_lr.py` — not machine-generated text shipped unreviewed.
- `narrative` must not state a victim count, date, or perpetrator that contradicts
  `match.coded*`. Divergent figures appear only with explicit source attribution.
- `sources` length ≥3 of `type` ∈ {primary, scholarship} for `merge.mode == "auto"`.
- Perpetrator language: where judicial convictions exist (El Salado), the narrative may
  state them with citation — this is stronger than the coded "presunto" and is allowed.
  Absent convictions, keep the project's "alleged per source" framing.

## UI wiring (the *Read more…* button)

1. **State** — extend the overlay enum in `state.svelte.ts`:
   `overlay = $state<'welcome' | 'credits' | 'story' | null>(null)` plus
   `storyId = $state<number | null>(null)` (the `IdCaso` whose modal is open).
2. **Data** — load `annotations.json` lazily (same pattern as `violence_details.bin`),
   expose as a `Record<string, Annotation>`; lookup key is `violence.id[gi]`.
3. **DetailPanel.svelte** — in `cardOf(gi)`, compute
   `story: annotations?.[violence.id[gi]] ?? null`. After the `registro` line
   (`DetailPanel.svelte:127`), render, only when `c.story`:
   ```svelte
   {#if c.story}
     <button class="readmore" onclick={() => { app.storyId = c.story.idCaso; app.overlay = 'story'; }}>
       {t('read_more')} →
     </button>
   {/if}
   ```
   The existing Escape handler already gates on `app.overlay === null`, so opening the
   story modal correctly suspends the panel's Escape.
4. **EventStory.svelte** — new component cloned from `Credits.svelte` (backdrop +
   `role="dialog"` + backdrop-click/Escape close). Renders `title`, `narrative[ui.lang]`,
   a sources `<ul>` (same gold-link styling), and — when `merge.mode != "auto"` — a small
   note that the count/figures are under review. Mount it in `App.svelte` next to the
   other overlays: `{#if app.overlay === 'story'} <EventStory .../> {/if}`.
5. **i18n** — add `read_more: { es: 'Leer más', en: 'Read more' }` and a
   `story_review_note` pair to `i18n.svelte.ts`.

## Curation flow (per event)
1. Find a well-documented event → web-search authoritative sources.
2. Run the disambiguation query against the raw `casos_<MOD>` CSV (municipio + year →
   inspect candidates) → confirm exactly one `IdCaso`; else **reject**.
3. Cross-check the source facts against the row's coded date / count / perpetrator.
4. Draft bilingual narrative + ≥3 sources; set `merge.mode` per policy.
5. `auto` merges; `review_required` waits for owner sign-off (`reviewedBy` / `reviewedOn`).
