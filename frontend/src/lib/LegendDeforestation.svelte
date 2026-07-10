<script lang="ts">
  import type { DeforestationData } from './data';
  import { formatInt } from './data';
  import { DRIVER_COLORS, AG_KIND_COLORS, COCA_COLOR, LEGALITY_COLORS } from './LossRasterLayer';
  import { app } from './state.svelte';
  import { t, ui } from './i18n.svelte';

  let { deforestation }: { deforestation: DeforestationData } = $props();

  const years = $derived(deforestation.years);
  const nat = $derived(deforestation.national);
  // Continuous (float) index into `years`, clamped. Driving the bars/numbers off
  // this instead of the floored defYear lets them glide as defPos advances
  // (RAF playback + step="any" scrub) rather than jumping each integer year.
  const fpos = $derived(
    Math.min(Math.max(app.defPos, years[0]), years[years.length - 1]) - years[0]
  );
  const yearIdx = $derived(Math.min(Math.floor(fpos), years.length - 1));
  const cumulative = $derived(thru(nat));

  // Which lens drives the ranked list + the map spotlight. Default to the
  // agriculture lens — the "what is the cleared land feeding" question is the one
  // this view is built to answer (pasture/cattle is the headline).
  let lens = $state<'kind' | 'legality' | 'driver'>('kind');

  // 'year' = loss in the scrubbed year alone; 'total' = accumulated loss from
  // 2001 through the scrubbed year (matches what the map raster actually paints,
  // which is cumulative up to defYear).
  let mode = $state<'year' | 'total'>('total');

  // Single-year value, DISCRETE: the whole year holds its value and steps only at
  // the year boundary (year mode should not glide mid-year — only accumulated
  // mode interpolates).
  function atYear(arr: number[] | undefined): number {
    if (!arr || !arr.length) return 0;
    return arr[Math.min(yearIdx, arr.length - 1)] ?? 0;
  }
  // Interpolated cumulative value through the fractional position: whole years up
  // to floor(fpos) plus the in-progress fraction of the next year.
  function thru(arr: number[] | undefined): number {
    if (!arr || !arr.length) return 0;
    const w = Math.min(Math.floor(fpos), arr.length - 1);
    let s = 0;
    for (let k = 0; k <= w; k++) s += arr[k] ?? 0;
    return s + (arr[w + 1] ?? 0) * (fpos - w);
  }
  // Row value: cumulative (total) or single-year, per the mode toggle.
  function val(arr: number[] | undefined): number {
    return mode === 'total' ? thru(arr) : atYear(arr);
  }

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
        ha: val(deforestation.loss_by_driver[String(d.code)]),
      }))
      .sort((a, b) => b.ha - a.ha)
  );

  // Kind of agriculture (CORINE subsequent cover). Coca is deliberately NOT
  // ranked here: it is a 1 km presence MASK whose "hectares" are forest loss
  // over-counted across whole cells, not a land-cover area — comparing it to the
  // CORINE cover classes manufactures a false "coca > pasture" reading. It lives
  // in its own non-comparable overlay row below.
  const agriRows = $derived<Row[]>(
    deforestation.agkinds
      .map((k) => ({
        dim: 'kind' as const,
        code: k.code,
        label: ui.lang === 'es' ? k.label_es : k.label_en,
        color: AG_KIND_COLORS[k.code] ?? 'rgb(222,170,92)',
        ha: val(deforestation.loss_by_agkind[String(k.code)]),
      }))
      .sort((a, b) => b.ha - a.ha)
  );

  // Legality (zonal): loss inside protected areas / forest reserves vs elsewhere.
  const legalityRows = $derived<Row[]>(
    deforestation.legality_classes
      .map((c) => ({
        dim: 'legality' as const,
        code: c.code,
        label: ui.lang === 'es' ? c.label_es : c.label_en,
        color: LEGALITY_COLORS[c.code] ?? 'rgb(141,143,148)',
        ha: val(deforestation.loss_by_legality[String(c.code)]),
      }))
      .sort((a, b) => b.ha - a.ha)
  );

  const rows = $derived(
    lens === 'kind' ? agriRows : lens === 'legality' ? legalityRows : driverRows
  );

  // Source series + static codes for the active lens (independent of the live,
  // ha-sorted `rows`, so the bar scale and the visibility mask don't recompute
  // every playback frame — only on a lens/mode switch).
  const lensSeries = $derived<(number[] | undefined)[]>(
    lens === 'kind'
      ? deforestation.agkinds.map((k) => deforestation.loss_by_agkind[String(k.code)])
      : lens === 'legality'
        ? deforestation.legality_classes.map((c) => deforestation.loss_by_legality[String(c.code)])
        : deforestation.drivers.map((d) => deforestation.loss_by_driver[String(d.code)])
  );
  const lensCodes = $derived<number[]>(
    lens === 'kind'
      ? deforestation.agkinds.map((k) => k.code)
      : lens === 'legality'
        ? deforestation.legality_classes.map((c) => c.code)
        : deforestation.drivers.map((d) => d.code)
  );

  // Bar scale is a STABLE all-time maximum, not the per-frame top row. Normalising
  // to the live max pins the leading bar at full width and lets the others drift
  // only fractionally, so the bars look frozen while the numbers climb. Against the
  // largest value any bucket reaches over the whole series, every bar fills from
  // ~0 toward its share as you scrub — the lengths track the figures.
  const barMax = $derived.by(() => {
    let m = 1;
    for (const arr of lensSeries) {
      if (!arr) continue;
      if (mode === 'total') {
        let s = 0;
        for (const v of arr) s += v ?? 0;
        if (s > m) m = s;
      } else {
        for (const v of arr) if ((v ?? 0) > m) m = v ?? 0;
      }
    }
    return m;
  });
  // Scale the bar with a compositor transform (scaleX), NOT width. A width change
  // is a layout/paint property: during a drag the deck.gl raster saturates the main
  // thread and the bar's repaint gets starved until the drag ends (the number's glyph
  // re-raster slips through, so it looks like "numbers move, bars don't"). scaleX is
  // applied by the GPU to the already-rasterised bar each composite frame — it can't
  // be starved, so the bar tracks the figure live.
  function barScale(r: Row): string {
    return `scaleX(${Math.max(0, r.ha / barMax)})`;
  }

  // The DOM keeps a STABLE order (by key); each row is slid to its current rank
  // slot via a CSS transform transition. Reordering the DOM instead (e.g.
  // animate:flip) fights the per-frame value updates during playback and pins
  // rows in place until you pause — this animates the swap live as ranks cross.
  const keyOf = (r: Row) => `${r.dim}:${r.code}`;
  const domRows = $derived([...rows].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1)));
  const rankOf = (r: Row) => rows.findIndex((x) => keyOf(x) === keyOf(r));

  // ---- bucket visibility (toggle a class on/off the map, like the violence
  // modality checkboxes). `hidden` is keyed `${dim}:${code}`; kind/legality/driver
  // keys don't collide, so each lens keeps its own toggles across switches.
  const lensDim = $derived(lens === 'kind' ? 2 : lens === 'legality' ? 3 : 1);
  let hidden = $state<Record<string, boolean>>({});
  function isHidden(r: Row): boolean {
    return !!hidden[keyOf(r)];
  }
  function toggle(r: Row) {
    const k = keyOf(r);
    hidden[k] = !hidden[k];
    if (hidden[k] && active(r)) unhover(); // drop a spotlight on a now-hidden bucket
  }
  function setAllBuckets(on: boolean) {
    for (const c of lensCodes) hidden[`${lens}:${c}`] = !on;
  }

  // Resolve the active lens's toggles into the raster's filterDim/filterMask.
  $effect(() => {
    let mask = 0;
    let off = false;
    for (const c of lensCodes) {
      if (hidden[`${lens}:${c}`]) off = true;
      else mask |= 1 << (c - 1);
    }
    app.defFilter = off ? { dim: lensDim, mask } : { dim: 0, mask: 0 };
  });

  // In 'year' mode the hover spotlight lights only the scrubbed year's loss;
  // 'total' mode lights every year up to the scrub (0 = cumulative).
  $effect(() => {
    app.defSpotYear = mode === 'year' ? app.defYear - 2000 : 0;
  });

  // Coca presence overlay (agri lens only), kept OUT of the ranked list above.
  // SIMCI monitored coca area is a yearly STOCK (not forest loss) and its 1 km
  // mask is not comparable to CORINE cover hectares. Show the scrubbed year's
  // standing area, or the latest published year ≤ now (SIMCI ends 2023), and let
  // it drive the same map spotlight on hover.
  const cocaArea = $derived.by<{ ha: number; year: number } | null>(() => {
    const a = deforestation.coca_area_by_year;
    for (let k = Math.min(yearIdx, a.length - 1); k >= 0; k--) {
      const v = a[k];
      if (v != null) return { ha: v, year: years[k] };
    }
    return null;
  });
  const cocaActive = $derived(app.defSpot.dim === 'coca');
  function cocaHover() {
    app.defSpot = { dim: 'coca', code: 1 };
  }

  function hover(r: Row) {
    if (isHidden(r)) return; // a hidden bucket has nothing to spotlight
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

  // Bilingual caveats live in i18n (the deforestation.json meta carries only a
  // single-language copy for provenance/audit; never render it directly).
  const lensCaveat = $derived(
    lens === 'kind'
      ? t('def_cav_agkind')
      : lens === 'legality'
        ? t('def_cav_legality')
        : t('def_cav_drivers')
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
  <!-- national headline: cumulative loss through the scrubbed year. The annual
       rhythm (histogram + per-year figure) lives in the timebar alone — the
       legend never restates what the scrubber already shows. -->
  <ul class="figs">
    <li>
      <span class="k mono dim">
        {t('def_total_muni')} · {app.defYear === years[0] ? years[0] : `${years[0]}–${app.defYear}`}
      </span>
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
    <div class="seg" role="tablist">
      <button role="tab" aria-selected={mode === 'year'} class:on={mode === 'year'}
        onclick={() => (mode = 'year')} title={String(app.defYear)}>{t('def_mode_year')}</button>
      <button role="tab" aria-selected={mode === 'total'} class:on={mode === 'total'}
        onclick={() => (mode = 'total')} title="2001–{app.defYear}">{t('def_mode_total')}</button>
    </div>
  </div>
  <div class="rowshead">
    <p class="note mono hint">{lensHint}</p>
    <span class="bulk mono">
      <button onclick={() => setAllBuckets(true)}>{t('all')}</button>
      <span class="sep">/</span>
      <button onclick={() => setAllBuckets(false)}>{t('none')}</button>
    </span>
  </div>

  <!-- ranked rows; hover spotlights a bucket on the map, click toggles it on/off -->
  <ul class="rows">
    {#each domRows as r, di (keyOf(r))}
      {@const rank = rankOf(r)}
      {@const off = isHidden(r)}
      <li
        class:dim={dimmed && !active(r)}
        class:off
        style:transform="translateY(calc({rank - di} * 100%))"
      >
        <button
          class="drow"
          aria-pressed={!off}
          title={off ? t('def_bucket_show') : t('def_bucket_hide')}
          onclick={() => toggle(r)}
          onmouseenter={() => hover(r)}
          onmouseleave={unhover}
          onfocus={() => hover(r)}
          onblur={unhover}
        >
          <span class="rk mono">{rank + 1}</span>
          <span class="sw" class:hollow={off} style:background={off ? 'transparent' : r.color}
            style:border-color={r.color}></span>
          <span class="dn" title={r.label}>{r.label}</span>
          <span class="ha mono">{formatInt(Math.round(r.ha), ui.lang)} {t('def_ha')}</span>
        </button>
        <span class="dbar" style:transform={barScale(r)} style:background={r.color}></span>
      </li>
    {/each}
  </ul>

  {#if lens === 'kind'}
    <!-- coca: a 1 km presence mask, NOT a cover class — separated from the ranked
         list so its over-counted hectares can't read as "coca > pasture" -->
    <div class="coca-wrap">
      <button
        class="drow coca-overlay"
        class:dim={dimmed && !cocaActive}
        class:on={cocaActive}
        onmouseenter={cocaHover}
        onmouseleave={unhover}
        onfocus={cocaHover}
        onblur={unhover}
      >
        <span class="rk"></span>
        <span class="sw" style:background={COCA_COLOR}></span>
        <span class="dn">Coca <span class="tag">· {t('def_coca_overlay')}</span></span>
        <span class="ha mono">
          {#if cocaArea}{formatInt(Math.round(cocaArea.ha), ui.lang)}
            {t('def_ha')}{#if cocaArea.year !== app.defYear}&nbsp;({cocaArea.year}){/if}{:else}—{/if}
        </span>
      </button>
      <p class="note mono coca-note">{t('def_coca_note')}</p>
    </div>
  {/if}

  <!-- caveats collapsed behind a clearly labeled, bright-coloured toggle -->
  <details class="disclaimers">
    <summary class="mono">{t('def_disclaimers_title')}</summary>
    {#if lens === 'kind'}
      <p class="note mono callout">{t('def_agri_vintage')}</p>
    {/if}
    <p class="note mono warn">{lensCaveat}</p>
  </details>

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

  .figs {
    list-style: none;
    margin: 0;
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
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .seg {
    display: inline-flex;
    flex: none; /* never shrink — overflow:hidden would otherwise clip the labels */
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
    white-space: nowrap;
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

  .hint {
    margin-top: 3px;
    opacity: 0.8;
  }

  /* hint + bulk on/off control above the ranked list */
  .rowshead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .rowshead .hint {
    flex: 1;
    min-width: 0;
  }

  .bulk {
    flex: none;
    font-size: 10px;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .bulk button {
    background: none;
    border: 0;
    padding: 0 2px;
    color: var(--paper-dim);
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .bulk button:hover {
    color: var(--gold);
  }

  .bulk .sep {
    color: var(--paper-faint);
    opacity: 0.6;
  }

  /* coca presence overlay — visually divorced from the ranked cover list so its
     1 km-mask hectares don't read as a comparable magnitude */
  .coca-wrap {
    margin-top: 9px;
    padding-top: 8px;
    border-top: 1px dashed var(--hairline);
  }

  .coca-overlay {
    transition: opacity 0.12s ease;
  }

  .coca-overlay.dim {
    opacity: 0.32;
  }

  /* allow the long "not comparable" label to wrap instead of ellipsizing
     (the ranked rows force one line for uniform height; this row is exempt) */
  .coca-overlay .dn {
    white-space: normal;
    overflow: visible;
  }

  .coca-overlay .tag {
    font-size: 9.5px;
    letter-spacing: 0.02em;
    color: var(--paper-faint);
  }

  .coca-overlay.on .dn,
  .coca-overlay:hover .dn {
    color: var(--paper);
  }

  .coca-note {
    margin-top: 4px;
  }

  .rows {
    list-style: none;
    margin: 7px 0 0;
    padding: 0;
  }

  .rows li {
    position: relative;
    padding: 3px 0;
    /* transform slides a row to its rank slot (translateY in whole-row units);
       opacity handles the spotlight dimming */
    transition: opacity 0.12s ease, transform 0.26s ease;
  }

  .rows li.dim {
    opacity: 0.32;
  }

  /* toggled-off bucket: greyed and struck through, its bar nearly gone */
  .rows li.off {
    opacity: 0.42;
  }

  .rows li.off .dn {
    text-decoration: line-through;
    text-decoration-thickness: 1px;
  }

  .rows li.off .dbar {
    opacity: 0.22;
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
    min-width: 0;
    /* single line keeps every row the same height, so translateY in whole-row
       units lands each row exactly on its rank slot */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12.5px;
    color: var(--paper-dim);
  }

  .sw {
    flex: none;
    width: 9px;
    height: 9px;
    border: 1px solid transparent;
    border-radius: 2px;
    align-self: center;
  }

  /* toggled-off bucket: hollow swatch ring instead of a filled chip */
  .sw.hollow {
    background: transparent;
  }

  .ha {
    flex: none;
    font-size: 10.5px;
    color: var(--paper-faint);
  }

  .dbar {
    display: block;
    height: 3px;
    /* full track width; the live value is applied as scaleX (compositor-only,
       starvation-proof during a drag) from the left edge */
    width: calc(100% - 1.4em - 17px);
    margin: 3px 0 0 calc(1.4em + 17px);
    border-radius: 2px;
    opacity: 0.85;
    transform-origin: left center;
    will-change: transform;
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

  /* Disclaimers — collapsed but loudly labeled so caveats aren't buried. */
  .disclaimers {
    margin-top: 9px;
    border: 1px solid var(--gold);
    border-radius: 4px;
    padding: 5px 9px;
    background: rgba(232, 130, 30, 0.09);
  }

  .disclaimers summary {
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .disclaimers summary:hover {
    color: var(--paper);
  }

  .disclaimers[open] summary {
    margin-bottom: 2px;
  }

  /* prominent — the 2022-vintage / coarse-bucket caveat must not read as fine print */
  .callout {
    color: var(--gold);
    border-left: 2px solid var(--gold);
    padding: 4px 0 4px 8px;
    margin-top: 8px;
    opacity: 0.95;
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
