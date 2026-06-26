<script lang="ts">
  // Visual-tuning panel, only rendered when the URL has `?debug`. Reusable across
  // tabs via props; defaults to the Memoria store. Geometry sliders (rebuild=true)
  // commit on release — each commit rebuilds the tendril field; shader/marker
  // sliders update live uniforms per input.
  import { dbg, DBG_DEFAULTS, DBG_GROUPS } from './debug.svelte';

  type Param = { key: string; label: string; min: number; max: number; step: number; rebuild?: boolean };
  type Group = { title: string; params: Param[] };
  type Store = Record<string, number>;
  type RampStop = { hex: string; pos: number };

  let {
    store = dbg as Store,
    defaults = DBG_DEFAULTS as Store,
    groups = DBG_GROUPS as Group[],
    title = 'memoria · debug',
    ramp,
    rampDefaults,
    rampLabels,
    colors,
    colorDefaults,
    colorKeys,
    anchor = 'right',
  }: {
    store?: Store;
    defaults?: Store;
    groups?: Group[];
    title?: string;
    /** optional cooldown colour ramp (mutated in place) */
    ramp?: RampStop[];
    rampDefaults?: RampStop[];
    rampLabels?: string[];
    /** optional flat colour pickers (no position): hex store keyed by colorKeys */
    colors?: Record<string, string>;
    colorDefaults?: Record<string, string>;
    colorKeys?: { key: string; label: string }[];
    /** which side of the map to dock against ('left' avoids the right-anchored panel) */
    anchor?: 'right' | 'left';
  } = $props();

  // live readout while dragging a rebuild slider (value not yet committed)
  let preview = $state<{ key: string; value: number } | null>(null);

  function shown(p: Param): number {
    return preview?.key === p.key ? preview.value : store[p.key];
  }

  function oninput(p: Param, e: Event) {
    const v = +(e.currentTarget as HTMLInputElement).value;
    if (p.rebuild) preview = { key: p.key, value: v };
    else store[p.key] = v;
  }

  function onchange(p: Param, e: Event) {
    store[p.key] = +(e.currentTarget as HTMLInputElement).value;
    preview = null;
  }

  function reset() {
    Object.assign(store, defaults);
    if (ramp && rampDefaults) ramp.forEach((s, i) => Object.assign(s, rampDefaults[i]));
    if (colors && colorDefaults) Object.assign(colors, colorDefaults);
    preview = null;
  }

  function copy() {
    const out: Record<string, unknown> = Object.fromEntries(
      Object.entries(defaults)
        .filter(([k]) => store[k] !== defaults[k])
        .map(([k]) => [k, store[k]])
    );
    // include the full colour ramp when any stop differs from its default, so the
    // copied JSON is directly usable as RAMP_DEFAULTS.
    if (ramp) {
      const changed = rampDefaults
        ? ramp.some((s, i) => s.hex !== rampDefaults[i].hex || s.pos !== rampDefaults[i].pos)
        : true;
      if (changed) out.ramp = ramp.map((s) => ({ hex: s.hex, pos: s.pos }));
    }
    // include changed flat colours so the copied JSON is reusable as defaults
    if (colors) {
      const c: Record<string, string> = {};
      for (const k of Object.keys(colors)) {
        if (!colorDefaults || colors[k] !== colorDefaults[k]) c[k] = colors[k];
      }
      if (Object.keys(c).length) Object.assign(out, c);
    }
    void navigator.clipboard.writeText(JSON.stringify(out, null, 2));
  }
</script>

<div class="dbg mono" class:left={anchor === 'left'}>
  <div class="hd">
    <span>{title}</span>
    <span class="acts">
      <button onclick={copy} title="copy changed values as JSON">copy</button>
      <button onclick={reset}>reset</button>
    </span>
  </div>
  {#each groups as g (g.title)}
    <div class="grp">{g.title}</div>
    {#each g.params as p (p.key)}
      <label class="row">
        <span class="lbl" class:changed={store[p.key] !== defaults[p.key]}>{p.label}</span>
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step}
          value={shown(p)}
          oninput={(e) => oninput(p, e)}
          onchange={(e) => onchange(p, e)}
        />
        <span class="val">{shown(p)}</span>
      </label>
    {/each}
  {/each}
  {#if ramp}
    <div class="grp">cooldown colour ramp (hot → cold)</div>
    {#each ramp as stop, i (i)}
      <label class="row ramp">
        <input
          type="color"
          value={stop.hex}
          oninput={(e) => (stop.hex = (e.currentTarget as HTMLInputElement).value)}
        />
        <span class="lbl">{rampLabels?.[i] ?? `stop ${i}`}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={stop.pos}
          oninput={(e) => (stop.pos = +(e.currentTarget as HTMLInputElement).value)}
        />
        <span class="val">{stop.pos}</span>
      </label>
    {/each}
  {/if}
  {#if colors && colorKeys}
    <div class="grp">colours</div>
    {#each colorKeys as ck (ck.key)}
      <label class="row colorrow">
        <input
          type="color"
          value={colors[ck.key]}
          oninput={(e) => (colors[ck.key] = (e.currentTarget as HTMLInputElement).value)}
        />
        <span class="lbl" class:changed={!!colorDefaults && colors[ck.key] !== colorDefaults[ck.key]}>
          {ck.label}
        </span>
        <span class="val">{colors[ck.key]}</span>
      </label>
    {/each}
  {/if}
</div>

<style>
  .dbg {
    position: absolute;
    top: 18px;
    right: 18px;
    z-index: 11;
    width: 280px;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    scrollbar-width: thin;
    background: rgba(11, 13, 17, 0.92);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 8px 10px 10px;
    font-size: 10px;
  }

  .dbg.left {
    right: auto;
    left: 18px;
  }

  .hd {
    display: flex;
    justify-content: space-between;
    align-items: center;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 4px;
  }

  .acts {
    display: flex;
    gap: 4px;
  }

  .acts button {
    font-size: 9px;
    letter-spacing: 0.08em;
    color: var(--paper-dim);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 2px 6px;
  }

  .acts button:hover {
    color: var(--gold);
    border-color: var(--gold);
  }

  .grp {
    margin: 8px 0 2px;
    color: var(--paper-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--hairline-soft);
    padding-bottom: 2px;
  }

  .row {
    display: grid;
    grid-template-columns: 102px 1fr 38px;
    align-items: center;
    gap: 6px;
    padding: 1px 0;
  }

  .lbl {
    color: var(--paper-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lbl.changed {
    color: var(--gold);
  }

  .val {
    color: var(--paper-dim);
    text-align: right;
  }

  .row input[type='range'] {
    width: 100%;
    height: 12px;
    accent-color: var(--gold);
    background: transparent;
  }

  .row.ramp {
    grid-template-columns: 22px 70px 1fr 26px;
  }

  .row.colorrow {
    grid-template-columns: 22px 1fr 58px;
  }

  .row.ramp input[type='color'],
  .row.colorrow input[type='color'] {
    width: 20px;
    height: 14px;
    padding: 0;
    border: 1px solid var(--hairline);
    border-radius: 2px;
    background: transparent;
    cursor: pointer;
  }
</style>
