<script lang="ts">
  import type { ViolenceData } from './data';
  import { formatInt } from './data';
  import { MODALITY_COLORS } from './colors';
  import { app } from './state.svelte';
  import { t, ui, modalityName } from './i18n.svelte';

  let { violence }: { violence: ViolenceData } = $props();

  const yearMin = $derived(violence.meta.yearMin);

  function countFor(code: string): number {
    const m = violence.meta.modalities.find((x) => x.code === code)!;
    return app.allYears ? m.n : (m.yearCounts[app.year - yearMin] ?? 0);
  }

  const undatedTotal = $derived(
    violence.meta.modalities.reduce((a, m) => a + m.excluded.undated, 0)
  );
  const noMuniTotal = $derived(
    violence.meta.modalities.reduce((a, m) => a + m.excluded.noMunicipio, 0)
  );
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

  <ul>
    {#each violence.meta.modalities as m (m.code)}
      <li>
        <button
          class="row"
          class:off={!app.enabled[m.code]}
          onclick={() => (app.enabled[m.code] = !app.enabled[m.code])}
          aria-pressed={app.enabled[m.code]}
        >
          <span class="dot" style:background={MODALITY_COLORS[m.code]}></span>
          <span class="name">{modalityName(m.code)}</span>
          <span class="n mono dim">{formatInt(countFor(m.code), ui.lang)}</span>
        </button>
      </li>
    {/each}
  </ul>

  <hr class="rule" />

  <div class="integrity">
    <span class="eyebrow">{t('integrity_title')}</span>
    <p class="mono">
      <span class="num">{formatInt(undatedTotal, ui.lang)}</span>
      {t('undated_note')} ·
      <span class="num">{formatInt(noMuniTotal, ui.lang)}</span>
      {t('nomuni_note')}.
      <em>{t('never_imputed')}</em>
    </p>
  </div>
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

  ul {
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

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: none;
  }

  .name {
    color: var(--paper-dim);
    flex: 1;
  }

  .n {
    font-size: 11px;
  }

  .integrity p {
    margin: 6px 0 0;
    font-size: 10px;
    line-height: 1.6;
    color: var(--paper-faint);
  }

  .integrity .num {
    color: var(--paper-dim);
  }

  .integrity em {
    display: block;
    margin-top: 4px;
    font-style: normal;
    color: var(--paper-faint);
  }
</style>
