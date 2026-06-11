<script lang="ts">
  import type { ViolenceData } from './data';
  import { formatInt } from './data';
  import { app } from './state.svelte';
  import { t, ui, modalityName } from './i18n.svelte';

  let { violence }: { violence: ViolenceData } = $props();

  // victims per modality (the wound metric — area and blood follow victims)
  const victimsByCode = $derived.by(() => {
    const out: Record<string, number> = {};
    for (const m of violence.meta.modalities) {
      let v = 0;
      for (let i = m.start; i < m.end; i++) v += violence.victims[i];
      out[m.code] = v;
    }
    return out;
  });

  // totals across the enabled modalities (shown under the wound key)
  const enabledTotals = $derived.by(() => {
    let events = 0;
    let victims = 0;
    for (const m of violence.meta.modalities) {
      if (!app.enabled[m.code]) continue;
      events += m.n;
      victims += victimsByCode[m.code];
    }
    return { events, victims };
  });

  // events with year known but exact date unknown (scar-only display rule),
  // across every modality
  const scarOnly = $derived.by(() => {
    let n = 0;
    for (let i = 0; i < violence.meta.n; i++) if (violence.day[i] < 0) n++;
    return n;
  });
</script>

<div class="legend">
  <div class="head">
    <span class="eyebrow">{t('modalities')}</span>
    <span class="bulk mono">
      <button onclick={() => app.setAll(true)}>{t('all')}</button>
      <span class="dim">/</span>
      <button onclick={() => app.setAll(false)}>{t('none')}</button>
    </span>
  </div>

  <ul class="mods">
    {#each violence.meta.modalities as m (m.code)}
      <li>
        <button
          class="row"
          class:off={!app.enabled[m.code]}
          onclick={() => (app.enabled[m.code] = !app.enabled[m.code])}
          aria-pressed={app.enabled[m.code]}
        >
          <span class="dot"></span>
          <span class="name">{modalityName(m.code)}</span>
          <span class="n mono dim">{formatInt(victimsByCode[m.code], ui.lang)}</span>
        </button>
      </li>
    {/each}
  </ul>

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
    <li>
      <span class="w tendril"></span>
      <span class="wl">{t('wound_tendrils')}</span>
    </li>
  </ul>
  <p class="note mono">
    {t('victims_area')} · {formatInt(enabledTotals.events, ui.lang)}
    {ui.lang === 'es' ? 'casos' : 'cases'},
    {formatInt(enabledTotals.victims, ui.lang)}
    {ui.lang === 'es' ? 'víctimas' : 'victims'}
  </p>

  <hr class="rule" />

  <details class="method">
    <summary class="mono">{t('memoria_method_title')}</summary>
    <p class="note mono">{t('memoria_method_massacres')}</p>
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

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .bulk {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .bulk button {
    color: var(--paper-dim);
  }

  .bulk button:hover {
    color: var(--gold);
  }

  .mods {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 3px 2px;
    font-size: 12.5px;
    text-align: left;
    transition: opacity 0.15s;
  }

  .row:hover .name {
    color: var(--paper);
  }

  .row.off {
    opacity: 0.32;
  }

  .row.off .dot {
    background: var(--hairline) !important;
  }

  /* every event renders red on the map — the legend dots match, distinguished
     by name, not colour */
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: none;
    background: rgb(255, 47, 64);
  }

  .name {
    color: var(--paper-dim);
    flex: 1;
  }

  .n {
    font-size: 11px;
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

  .w.tendril {
    width: 13px;
    height: 3px;
    border-radius: 2px;
    background: linear-gradient(90deg, rgba(255, 58, 28, 0.9), rgba(255, 58, 28, 0));
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
