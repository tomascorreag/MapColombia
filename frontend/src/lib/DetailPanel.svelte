<script lang="ts">
  import type { ViolenceData, ViolenceDetails, Munis } from './data';
  import { formatInt } from './data';
  import { app } from './state.svelte';
  import { t, ui, modalityName } from './i18n.svelte';
  import { MODALITY_COLORS } from './colors';
  import { formatMonthYearInline } from './memoria';
  import { narrativeOf, portraitAddsInfo } from './narrative';

  let {
    violence,
    munis,
    details,
  }: { violence: ViolenceData; munis: Munis; details: ViolenceDetails | null } = $props();

  // source occupation strings are SHOUTY uppercase Spanish — render as sentence case
  function prettyOcc(s: string): string {
    return s.charAt(0) + s.slice(1).toLowerCase();
  }

  // "n noun" with singular/plural agreement (key vs key+'_one'); drops zero
  // counts and joins; null if every count is zero
  function tally(parts: [number, string][]): string | null {
    const nz = parts
      .filter(([n]) => n > 0)
      .map(([n, key]) => `${formatInt(n, ui.lang)} ${t(n === 1 ? `${key}_one` : key)}`);
    return nz.length ? nz.join(' · ') : null;
  }

  // The victim portrait for one event, or null until details load / when the
  // event has no individually-recorded victims.
  function portraitOf(gi: number) {
    if (!details) return null;
    const civ = details.civ[gi];
    const comb = details.comb[gi];
    const vn = details.vn[gi];
    const composition = tally([
      [civ, 'civilians'],
      [comb, 'combatants'],
    ]);
    const unknownSex = Math.max(0, vn - details.nMale[gi] - details.nFemale[gi]);
    const sex = tally([
      [details.nMale[gi], 'men'],
      [details.nFemale[gi], 'women'],
      [unknownSex, 'unrecorded'],
    ]);
    const age = tally([
      [details.nChild[gi], 'age_children'],
      [details.nAdolescent[gi], 'age_adolescents'],
      [details.nAdult[gi], 'age_adults'],
      [details.nElder[gi], 'age_elderly'],
    ]);
    const outcome = tally([
      [details.nFatal[gi], 'fatal'],
      [details.nNonFatal[gi], 'nonfatal'],
    ]);
    const occI = details.occTop[gi];
    const occupation =
      occI !== 0xffff
        ? `${prettyOcc(details.occupations[occI])} (${formatInt(details.occTopN[gi], ui.lang)})`
        : null;
    return { composition, vn, sex, age, outcome, occupation };
  }

  // CNMH Open Data Geoportal — the same home cited in Credits.svelte. There is
  // no per-record deep link; the citation key is the CNMH record number below.
  const GEOPORTAL = 'https://geoportal-de-datos-abiertos-cnmh-cnmh.hub.arcgis.com/';

  // Each event renders as one prose sentence (date, victim, modality verb,
  // alleged perpetrator, place — see narrative.ts for the integrity rules)
  // followed by the registro line. Coordinates are intentionally dropped: the
  // point is on the map and the registro number is the citation key.
  function cardOf(gi: number) {
    const m = violence.meta.modalities[violence.modOf[gi]];
    return {
      code: m.code,
      accent: MODALITY_COLORS[m.code],
      title: modalityName(m.code),
      sentence: narrativeOf(violence, munis, details, gi, ui.lang),
      registro: `${t('record')} ${t('record_no')} ${violence.id[gi]}`,
      showPortrait: portraitAddsInfo(violence, details, gi),
    };
  }

  // One card per event under the click, newest-first (the order MapView pins
  // them in). Reads the `details` prop, so sentences re-gender and portraits
  // fill in when the lazy buffers arrive.
  const cards = $derived(
    app.selected.map((gi) => ({ gi, ...cardOf(gi), portrait: portraitOf(gi) }))
  );

  // every distinct dataset across the pinned events, for the shared footer
  const datasets = $derived([
    ...new Set(app.selected.map((gi) => violence.meta.modalities[violence.modOf[gi]].dataset_name)),
  ]);

  function close() {
    app.selected = [];
    app.selectedDay = null;
  }

  function onkeydown(ev: KeyboardEvent) {
    // a modal owns Escape while open — only close the panel when none is
    if (ev.key === 'Escape' && app.selected.length > 0 && app.overlay === null) close();
  }
</script>

<svelte:window {onkeydown} />

{#if cards.length > 0}
  <aside class="ficha rise detail">
    <div class="head">
      <div class="title">
        {formatInt(cards.length, ui.lang)}
        {t(cards.length === 1 ? 'cases_through_one' : 'cases_through')}
        {formatMonthYearInline(app.selectedDay ?? 0, ui.lang)}
      </div>
      <button class="close mono" onclick={close} aria-label={t('close')}>✕</button>
    </div>

    <div class="cards">
      {#each cards as c (c.gi)}
        <article class="card" style:--accent-c={c.accent}>
          <div class="card-title">{c.title}</div>

          <p class="narrative">{c.sentence}</p>
          <p class="registro mono dim">{c.registro}</p>

          {#if c.portrait && c.showPortrait}
            <div class="portrait">
              <span class="eyebrow">{t('victims_portrait')}</span>
              {#if c.portrait.composition}
                <p class="lead">{c.portrait.composition}</p>
              {/if}
              {#if c.portrait.vn > 0}
                <dl class="pdl">
                  {#if c.portrait.sex}
                    <dt class="mono">{t('sex_label')}</dt>
                    <dd>{c.portrait.sex}</dd>
                  {/if}
                  {#if c.portrait.age}
                    <dt class="mono">{t('age_where_known')}</dt>
                    <dd>{c.portrait.age}</dd>
                  {/if}
                  {#if c.portrait.outcome}
                    <dt class="mono">{t('outcome_label')}</dt>
                    <dd>{c.portrait.outcome}</dd>
                  {/if}
                  {#if c.portrait.occupation}
                    <dt class="mono">{t('occupation_top')}</dt>
                    <dd>{c.portrait.occupation}</dd>
                  {/if}
                </dl>
                <p class="caption dim">
                  {formatInt(c.portrait.vn, ui.lang)}
                  {t(c.portrait.vn === 1 ? 'recorded_individually_one' : 'recorded_individually')} ·
                  {t('portrait_caption')}
                </p>
              {/if}
            </div>
          {/if}
        </article>
      {/each}
    </div>

    <div class="source">
      <span class="eyebrow">{t('sources')}</span>
      <p class="dim">
        <strong>CNMH · SIEVCAC</strong> — {datasets.join(' · ')}
      </p>
      <p class="dim">{t('license')}: CC BY 4.0</p>
      <a href={GEOPORTAL} target="_blank" rel="noopener">{t('view_geoportal')} ↗</a>
    </div>
  </aside>
{/if}

<style>
  .detail {
    position: absolute;
    top: 18px;
    right: 18px;
    z-index: 20;
    width: 332px;
    max-height: calc(100vh - 170px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--hairline) transparent;
    /* horizontal padding lives on the children so each card's accent border
       can run along the panel's left edge */
    padding: 14px 0 16px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
    padding: 0 16px;
  }

  .title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.15;
  }

  .close {
    flex: none;
    font-size: 11px;
    color: var(--paper-dim);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 3px 7px;
  }

  .close:hover {
    color: var(--gold);
    border-color: var(--gold);
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* boxed card: subtle background + gap reads as separation at a glance, where
     the old hairline divider between flush cards did not */
  .card {
    border-left: 3px solid var(--accent-c);
    background: rgba(255, 255, 255, 0.035);
    border-radius: 0 2px 2px 0;
    padding: 10px 16px 12px 13px;
  }

  .card-title {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.15;
    margin-bottom: 6px;
  }

  .narrative {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--paper);
  }

  .registro {
    margin: 6px 0 0;
    font-size: 10px;
    letter-spacing: 0.06em;
  }

  .source {
    margin: 14px 16px 0;
    padding-top: 10px;
    border-top: 1px solid var(--hairline-soft);
  }

  .source p {
    font-size: 11px;
    line-height: 1.4;
    margin: 5px 0 0;
  }

  .source strong {
    color: var(--paper);
    font-weight: 600;
  }

  .source a {
    display: inline-block;
    margin-top: 8px;
    font-size: 11px;
    color: var(--gold);
    border-bottom: 1px solid rgba(201, 162, 39, 0.35);
  }

  .source a:hover {
    border-bottom-color: var(--gold);
  }

  .portrait {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--hairline-soft);
  }

  .portrait .lead {
    font-family: var(--font-display);
    font-size: 13.5px;
    color: var(--paper);
    margin: 6px 0 8px;
  }

  .pdl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
  }

  .pdl dt {
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--paper-faint);
    align-self: baseline;
    padding-top: 3px;
  }

  .pdl dd {
    margin: 0;
    font-size: 12px;
    color: var(--paper);
  }

  .caption {
    font-size: 10px;
    line-height: 1.4;
    margin: 9px 0 0;
  }

  @media (max-width: 900px) {
    .detail {
      left: 18px;
      right: 18px;
      width: auto;
      max-height: 40vh;
    }
  }
</style>
