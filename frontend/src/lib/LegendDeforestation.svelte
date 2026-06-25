<script lang="ts">
  import type { DeforestationData } from './data';
  import { formatInt } from './data';
  import { DRIVER_COLORS, AG_KIND_COLORS, COCA_COLOR, LEGALITY_COLORS } from './LossRasterLayer';
  import { app } from './state.svelte';
  import { t, ui } from './i18n.svelte';

  let { deforestation }: { deforestation: DeforestationData } = $props();

  const years = $derived(deforestation.years);
  const nat = $derived(deforestation.national);
  const natMax = $derived(Math.max(1, ...nat));
  const current = $derived(nat[app.defYear - years[0]] ?? 0);
  const cumulative = $derived(
    nat.slice(0, app.defYear - years[0] + 1).reduce((a, b) => a + b, 0)
  );
  const yearIdx = $derived(app.defYear - years[0]);

  // Which lens drives the ranked list + the map spotlight. Default to the
  // agriculture lens — the "what is the cleared land feeding" question is the one
  // this view is built to answer (pasture/cattle is the headline).
  let lens = $state<'kind' | 'legality' | 'driver'>('kind');

  type Row = {
    dim: 'driver' | 'kind' | 'legality' | 'coca';
    code: number;
    label: string;
    color: string;
    ha: number;
  };

  // WRI/GDM drivers, ranked by THIS year's incidence (re-orders as you scrub).
  const driverRows = $derived<Row[]>(
    deforestation.drivers
      .map((d) => ({
        dim: 'driver' as const,
        code: d.code,
        label: ui.lang === 'es' ? d.label_es : d.label_en,
        color: DRIVER_COLORS[d.code] ?? 'rgb(232,130,30)',
        ha: deforestation.loss_by_driver[String(d.code)]?.[yearIdx] ?? 0,
      }))
      .sort((a, b) => b.ha - a.ha)
  );

  // Kind of agriculture (CORINE subsequent cover) + coca as its own row.
  const agriRows = $derived.by<Row[]>(() => {
    const rows: Row[] = deforestation.agkinds.map((k) => ({
      dim: 'kind' as const,
      code: k.code,
      label: ui.lang === 'es' ? k.label_es : k.label_en,
      color: AG_KIND_COLORS[k.code] ?? 'rgb(222,170,92)',
      ha: deforestation.loss_by_agkind[String(k.code)]?.[yearIdx] ?? 0,
    }));
    rows.push({
      dim: 'coca',
      code: 1,
      label: 'Coca',
      color: COCA_COLOR,
      ha: deforestation.coca_loss_by_year[yearIdx] ?? 0,
    });
    return rows.sort((a, b) => b.ha - a.ha);
  });

  // Legality (zonal): loss inside protected areas / forest reserves vs elsewhere.
  const legalityRows = $derived<Row[]>(
    deforestation.legality_classes
      .map((c) => ({
        dim: 'legality' as const,
        code: c.code,
        label: ui.lang === 'es' ? c.label_es : c.label_en,
        color: LEGALITY_COLORS[c.code] ?? 'rgb(141,143,148)',
        ha: deforestation.loss_by_legality[String(c.code)]?.[yearIdx] ?? 0,
      }))
      .sort((a, b) => b.ha - a.ha)
  );

  const rows = $derived(
    lens === 'kind' ? agriRows : lens === 'legality' ? legalityRows : driverRows
  );
  const rowMax = $derived(Math.max(1, ...rows.map((r) => r.ha)));

  function hover(r: Row) {
    app.defSpot = { dim: r.dim, code: r.code };
  }
  function unhover() {
    app.defSpot = { dim: null, code: 0 };
  }
  function active(r: Row): boolean {
    return app.defSpot.dim === r.dim && app.defSpot.code === r.code;
  }
  const dimmed = $derived(app.defSpot.dim !== null);

  $effect(() => {
    // clear any spotlight when switching lens so a stale code doesn't linger
    lens;
    unhover();
  });

  const lensCaveat = $derived(
    lens === 'kind'
      ? deforestation.meta.agkind_source?.caveat
      : lens === 'legality'
        ? deforestation.meta.legality_source?.caveat
        : deforestation.meta.drivers_source?.caveat
  );
  const lensHint = $derived(
    lens === 'kind'
      ? t('def_agri_hint')
      : lens === 'legality'
        ? t('def_legality_hint')
        : t('def_drivers_hint')
  );

  // IDEAM curated ranking — kept as qualitative Colombia-specific context below.
  const causes = $derived([...deforestation.causes].sort((a, b) => a.rank - b.rank));
  function driver(c: DeforestationData['causes'][number]): string {
    return ui.lang === 'es' ? c.driver_es : c.driver_en;
  }
</script>

<div class="legend">
  <span class="eyebrow">{t('def_national_loss')}</span>

  <!-- national annual loss (Hansen). Bars up to the scrubbed year are lit. -->
  <svg class="meter" viewBox="0 0 {years.length} 50" preserveAspectRatio="none" aria-hidden="true">
    {#each nat as v, i (i)}
      <rect
        x={i + 0.1}
        y={50 - (v / natMax) * 48}
        width="0.8"
        height={(v / natMax) * 48}
        class:lit={years[i] <= app.defYear}
      />
    {/each}
  </svg>
  <div class="axis mono dim">
    <span>{years[0]}</span><span>{years[years.length - 1]}</span>
  </div>

  <ul class="figs">
    <li>
      <span class="k mono dim">{app.defYear}</span>
      <span class="v">{formatInt(Math.round(current), ui.lang)} {t('def_hectares')}</span>
    </li>
    <li>
      <span class="k mono dim">{t('def_total_muni')}</span>
      <span class="v">{formatInt(Math.round(cumulative), ui.lang)} {t('def_hectares')}</span>
    </li>
  </ul>

  <p class="note mono ref">
    {t('def_ideam_ref')}:
    {#each deforestation.ideam_national as r (r.year)}
      <span>{r.year} — {formatInt(r.ha, ui.lang)} {t('def_ha')}</span>
    {/each}
  </p>

  <hr class="rule" />

  <!-- lens toggle: what dimension to rank + spotlight -->
  <div class="lenswrap">
    <div class="seg" role="tablist">
      <button role="tab" aria-selected={lens === 'kind'} class:on={lens === 'kind'}
        onclick={() => (lens = 'kind')}>{t('def_lens_agri')}</button>
      <button role="tab" aria-selected={lens === 'legality'} class:on={lens === 'legality'}
        onclick={() => (lens = 'legality')}>{t('def_lens_legality')}</button>
      <button role="tab" aria-selected={lens === 'driver'} class:on={lens === 'driver'}
        onclick={() => (lens = 'driver')}>{t('def_lens_drivers')}</button>
    </div>
    <span class="lensyear mono dim">{app.defYear}</span>
  </div>
  <p class="note mono hint">{lensHint}</p>

  <!-- ranked rows; hovering a row spotlights its loss on the map up to the year -->
  <ul class="rows">
    {#each rows as r, i (r.dim + r.code)}
      <li class:dim={dimmed && !active(r)}>
        <button
          class="drow"
          onmouseenter={() => hover(r)}
          onmouseleave={unhover}
          onfocus={() => hover(r)}
          onblur={unhover}
        >
          <span class="rk mono">{i + 1}</span>
          <span class="sw" style:background={r.color}></span>
          <span class="dn">{r.label}</span>
          <span class="ha mono">{formatInt(Math.round(r.ha), ui.lang)} {t('def_ha')}</span>
        </button>
        <span class="dbar" style:width="{(r.ha / rowMax) * 100}%" style:background={r.color}
        ></span>
      </li>
    {/each}
  </ul>
  {#if lensCaveat}
    <p class="note mono warn">{lensCaveat}</p>
  {/if}

  <details class="ideam">
    <summary class="mono">{t('def_causes_title')}</summary>
    <ol class="causes">
      {#each causes as c (c.rank)}
        <li title={c.source}>
          <span class="rk mono">{c.rank}</span>
          <span class="dn">{driver(c)}</span>
        </li>
      {/each}
    </ol>
    <p class="note mono warn">{t('def_causes_disclaimer')}</p>
  </details>

  <hr class="rule" />

  <details class="method">
    <summary class="mono">{t('def_method_title')}</summary>
    <p class="note mono">{t('def_method')}</p>
    <p class="note mono">{t('def_click_hint')} {t('never_imputed')}</p>
  </details>
</div>

<style>
  .legend {
    padding: 12px 16px 14px;
  }

  .meter {
    display: block;
    width: 100%;
    height: 50px;
    margin-top: 8px;
  }

  .meter rect {
    fill: rgba(232, 130, 30, 0.22);
  }

  .meter rect.lit {
    fill: rgba(232, 130, 30, 0.82);
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

  .ref {
    margin-top: 8px;
  }

  .ref span {
    color: var(--paper-dim);
  }

  /* ---- lens toggle ---- */
  .lenswrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .seg {
    display: inline-flex;
    border: 1px solid var(--line, rgba(232, 130, 30, 0.28));
    border-radius: 4px;
    overflow: hidden;
  }

  .seg button {
    background: none;
    border: 0;
    padding: 3px 9px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--paper-dim);
    cursor: pointer;
  }

  .seg button.on {
    background: rgba(232, 130, 30, 0.18);
    color: var(--paper);
  }

  .seg button:hover:not(.on) {
    color: var(--gold);
  }

  .lensyear {
    font-size: 11px;
  }

  .hint {
    margin-top: 3px;
    opacity: 0.8;
  }

  .rows {
    list-style: none;
    margin: 7px 0 0;
    padding: 0;
  }

  .rows li {
    padding: 3px 0;
    transition: opacity 0.12s ease;
  }

  .rows li.dim {
    opacity: 0.32;
  }

  .drow {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .drow:hover .dn,
  .drow:focus-visible .dn {
    color: var(--paper);
  }

  .rk {
    flex: none;
    width: 1.4em;
    color: var(--gold);
    font-size: 12px;
  }

  .dn {
    flex: 1;
    font-size: 12.5px;
    color: var(--paper-dim);
  }

  .sw {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 2px;
    align-self: center;
  }

  .ha {
    flex: none;
    font-size: 10.5px;
    color: var(--paper-faint);
  }

  .dbar {
    display: block;
    height: 3px;
    margin: 3px 0 0 calc(1.4em + 17px);
    border-radius: 2px;
    opacity: 0.85;
    min-width: 1px;
  }

  .ideam summary {
    cursor: pointer;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--paper-dim);
    margin-top: 8px;
  }

  .ideam summary:hover {
    color: var(--gold);
  }

  .ideam .causes {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  .ideam .causes li {
    display: flex;
    gap: 9px;
    align-items: baseline;
    padding: 5px 0;
  }

  .note {
    margin: 7px 0 0;
    font-size: 10px;
    line-height: 1.6;
    color: var(--paper-faint);
  }

  .warn {
    color: var(--gold);
    opacity: 0.85;
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
