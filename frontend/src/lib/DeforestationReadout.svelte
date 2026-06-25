<script lang="ts">
  import type { DeforestationData, Munis } from './data';
  import { formatInt } from './data';
  import { app } from './state.svelte';
  import { t, ui } from './i18n.svelte';

  let {
    deforestation,
    munis,
  }: { deforestation: DeforestationData; munis: Munis } = $props();

  // muni index -> per-year loss row (built once)
  const byMuni = $derived.by(() => {
    const map = new Map<number, number[]>();
    deforestation.m.forEach((mi, i) => map.set(mi, deforestation.loss[i]));
    return map;
  });

  const sel = $derived(app.defMuni);
  const row = $derived(sel == null ? null : (byMuni.get(sel) ?? null));
  const years = $derived(deforestation.years);
  const rowMax = $derived(row ? Math.max(1, ...row) : 1);
  const current = $derived(row ? (row[app.defYear - years[0]] ?? 0) : 0);
  // running total through the scrubbed year (inclusive)
  const cumulative = $derived(
    row ? row.slice(0, app.defYear - years[0] + 1).reduce((a, b) => a + b, 0) : 0
  );

  // ICA cattle inventory for this municipio (latest year + the prior-year delta).
  // The hard number behind the pasture story: forest-loss frontiers carry big herds.
  const cattle = $derived.by(() => {
    if (sel == null) return null;
    const rec = deforestation.cattle[String(sel)];
    if (!rec) return null;
    const yrs = Object.keys(rec)
      .map(Number)
      .sort((a, b) => a - b);
    if (!yrs.length) return null;
    const latest = yrs[yrs.length - 1];
    const prev = yrs.length > 1 ? yrs[0] : null;
    return { latest, head: rec[String(latest)], prevYear: prev, prevHead: prev ? rec[String(prev)] : null };
  });

  function close() {
    app.defMuni = null;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if sel != null}
  <aside class="readout ficha" aria-live="polite">
    <button class="x mono" onclick={close} aria-label={t('close')}>✕</button>
    <span class="eyebrow">{munis.depts[sel]}</span>
    <h3>{munis.names[sel]}</h3>

    {#if row}
      <svg class="spark" viewBox="0 0 {years.length} 40" preserveAspectRatio="none" aria-hidden="true">
        {#each row as v, i (i)}
          <rect
            x={i + 0.1}
            y={40 - (v / rowMax) * 38}
            width="0.8"
            height={(v / rowMax) * 38}
            class:lit={years[i] <= app.defYear}
          />
        {/each}
      </svg>
      <div class="axis mono dim">
        <span>{years[0]}</span><span>{years[years.length - 1]}</span>
      </div>

      <ul class="figs">
        <li>
          <span class="k mono dim">{t('def_loss_in')} {app.defYear}</span>
          <span class="v">{formatInt(Math.round(current), ui.lang)} {t('def_hectares')}</span>
        </li>
        <li>
          <span class="k mono dim">{t('def_total_muni')}</span>
          <span class="v">{formatInt(Math.round(cumulative), ui.lang)} {t('def_hectares')}</span>
        </li>
      </ul>
    {:else}
      <p class="note mono">{t('def_no_loss_muni')}</p>
    {/if}

    {#if cattle}
      <ul class="figs cattle">
        <li>
          <span class="k mono dim">{t('def_cattle')} · {cattle.latest}</span>
          <span class="v">{formatInt(cattle.head, ui.lang)} {t('def_cattle_head')}</span>
        </li>
      </ul>
    {/if}

    <p class="note mono src">{deforestation.meta.render_source.citation}</p>
    <p class="note mono src dim">{deforestation.meta.definition_caveat}</p>
  </aside>
{/if}

<style>
  .readout {
    position: absolute;
    right: 18px;
    top: 18px;
    z-index: 12;
    width: 300px;
    padding: 14px 16px 12px;
  }

  .x {
    position: absolute;
    top: 8px;
    right: 10px;
    font-size: 12px;
    color: var(--paper-faint);
  }

  .x:hover {
    color: var(--gold);
  }

  h3 {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 600;
    margin: 2px 0 8px;
    color: var(--paper);
  }

  .spark {
    display: block;
    width: 100%;
    height: 40px;
  }

  .spark rect {
    fill: rgba(232, 130, 30, 0.24);
  }

  .spark rect.lit {
    fill: rgba(232, 130, 30, 0.85);
  }

  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    letter-spacing: 0.1em;
    margin-top: 2px;
  }

  .figs {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
  }

  .figs li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 2px 0;
  }

  .figs .k {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .figs .v {
    font-size: 13px;
    color: var(--paper);
  }

  .note {
    margin: 7px 0 0;
    font-size: 10px;
    line-height: 1.55;
    color: var(--paper-faint);
  }

  .src {
    border-top: 1px solid var(--hairline);
    padding-top: 7px;
    margin-top: 10px;
  }
</style>
