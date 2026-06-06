<script lang="ts">
  import type { Body, ViolenceData } from './data';
  import { formatInt } from './data';
  import { type MemoriaData, rampCSS, dayOfISO } from './memoria';
  import { app } from './state.svelte';
  import { t, ui } from './i18n.svelte';

  let { memoria, violence }: { memoria: MemoriaData; violence: ViolenceData } = $props();

  const BODIES: Body[] = ['camara', 'senado', 'presidencia'];
  const ramp = rampCSS();

  // FN-era banner: only the presidential field is an artifact of the pact
  const fnVisible = $derived(app.mbody === 'presidencia' && app.mday < dayOfISO('1975-01-01'));

  const maMeta = $derived(violence.meta.modalities[0]);
  // massacres with year known but exact date unknown (scar-only display rule)
  const scarOnly = $derived.by(() => {
    let n = 0;
    for (let i = 0; i < maMeta.n; i++) if (violence.day[maMeta.start + i] < 0) n++;
    return n;
  });
  const totalVictims = $derived.by(() => {
    let n = 0;
    for (let i = 0; i < maMeta.n; i++) n += violence.victims[maMeta.start + i];
    return n;
  });
</script>

<div class="legend">
  <div class="bodies">
    {#each BODIES as b (b)}
      <button
        class="body mono"
        class:active={app.mbody === b}
        aria-pressed={app.mbody === b}
        onclick={() => (app.mbody = b)}
      >
        {t(b)}
      </button>
    {/each}
  </div>

  {#if fnVisible}
    <p class="fn mono">{t('fn_banner')}</p>
  {/if}

  <span class="eyebrow">{t('memoria_field')}</span>
  <div class="ramp" style:background={ramp}></div>
  <div class="ramp-labels mono dim">
    <span>{t('lr_left')}</span>
    <span>{t('lr_right')}</span>
  </div>
  <div class="nodata mono dim">
    <span class="swatch"></span>
    {t('no_data')} · {t('low_coverage')}
  </div>

  <hr class="rule" />

  <span class="eyebrow">{t('wounds_title')}</span>
  <ul class="wounds">
    <li>
      <span class="w fresh"></span>
      <span class="wl">{t('wound_fresh')}</span>
    </li>
    <li>
      <span class="w mid"></span>
      <span class="wl">{t('wound_healing')}</span>
    </li>
    <li>
      <span class="w scar"></span>
      <span class="wl">{t('wound_scar')}</span>
    </li>
  </ul>
  <p class="note mono">
    {t('victims_area')} · {formatInt(maMeta.n, ui.lang)}
    {ui.lang === 'es' ? 'masacres' : 'massacres'},
    {formatInt(totalVictims, ui.lang)}
    {ui.lang === 'es' ? 'víctimas' : 'victims'}
  </p>

  <hr class="rule" />

  <details class="method">
    <summary class="mono">{t('memoria_method_title')}</summary>
    <p class="note mono">{t('memoria_method')}</p>
    <p class="note mono">
      {formatInt(scarOnly, ui.lang)}
      {t('date_known_year')}.
      {t('never_imputed')}
    </p>
  </details>
</div>

<style>
  .legend {
    padding: 12px 16px 14px;
  }

  .bodies {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }

  .body {
    flex: 1;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--paper-dim);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 6px 0;
    transition:
      color 0.15s,
      border-color 0.15s;
  }

  .body:hover {
    color: var(--paper);
  }

  .body.active {
    color: var(--gold);
    border-color: var(--gold);
  }

  .fn {
    margin: 0 0 12px;
    padding: 7px 9px;
    font-size: 10px;
    line-height: 1.55;
    color: var(--gold);
    border: 1px solid var(--hairline);
    border-left: 3px solid var(--gold);
    border-radius: 2px;
  }

  .ramp {
    height: 10px;
    border-radius: 2px;
    margin-top: 8px;
    border: 1px solid var(--hairline-soft);
  }

  .ramp-labels {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-top: 4px;
  }

  .nodata {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 9.5px;
    line-height: 1.5;
    margin-top: 8px;
  }

  .swatch {
    width: 12px;
    height: 12px;
    flex: none;
    border-radius: 2px;
    background: rgba(26, 29, 36, 0.6);
    border: 1px solid var(--hairline);
  }

  .wounds {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  .wounds li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 3px 0;
    font-size: 11.5px;
  }

  .w {
    flex: none;
    border-radius: 50%;
  }

  .w.fresh {
    width: 13px;
    height: 13px;
    background: rgb(255, 47, 64);
    box-shadow: 0 0 9px 3px rgba(255, 58, 28, 0.55);
  }

  .w.mid {
    width: 10px;
    height: 10px;
    background: rgba(255, 47, 64, 0.45);
    box-shadow: 0 0 5px 1px rgba(255, 58, 28, 0.25);
  }

  .w.scar {
    width: 8px;
    height: 8px;
    background: rgba(96, 16, 22, 0.85);
  }

  .wl {
    color: var(--paper-dim);
  }

  .note {
    margin: 7px 0 0;
    font-size: 10px;
    line-height: 1.6;
    color: var(--paper-faint);
  }

  .method summary {
    cursor: pointer;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--paper-dim);
    margin-top: 2px;
  }

  .method summary:hover {
    color: var(--gold);
  }
</style>
