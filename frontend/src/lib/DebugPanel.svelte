<script lang="ts">
  // Visual-tuning panel, only rendered when the URL has `?debug`. Geometry
  // sliders (rebuild=true) commit on release — each commit rebuilds the
  // tendril field; shader/marker sliders update live uniforms per input.
  import { dbg, DBG_DEFAULTS, DBG_GROUPS, type DbgParam } from './debug.svelte';

  // live readout while dragging a rebuild slider (value not yet committed)
  let preview = $state<{ key: string; value: number } | null>(null);

  function shown(p: DbgParam): number {
    return preview?.key === p.key ? preview.value : dbg[p.key];
  }

  function oninput(p: DbgParam, e: Event) {
    const v = +(e.currentTarget as HTMLInputElement).value;
    if (p.rebuild) preview = { key: p.key, value: v };
    else dbg[p.key] = v;
  }

  function onchange(p: DbgParam, e: Event) {
    dbg[p.key] = +(e.currentTarget as HTMLInputElement).value;
    preview = null;
  }

  function reset() {
    Object.assign(dbg, DBG_DEFAULTS);
    preview = null;
  }

  function copy() {
    const diff = Object.fromEntries(
      Object.entries(DBG_DEFAULTS)
        .filter(([k]) => dbg[k as keyof typeof DBG_DEFAULTS] !== DBG_DEFAULTS[k as keyof typeof DBG_DEFAULTS])
        .map(([k]) => [k, dbg[k as keyof typeof DBG_DEFAULTS]])
    );
    void navigator.clipboard.writeText(JSON.stringify(diff, null, 2));
  }
</script>

<div class="dbg mono">
  <div class="hd">
    <span>memoria · debug</span>
    <span class="acts">
      <button onclick={copy} title="copy changed values as JSON">copy</button>
      <button onclick={reset}>reset</button>
    </span>
  </div>
  {#each DBG_GROUPS as g (g.title)}
    <div class="grp">{g.title}</div>
    {#each g.params as p (p.key)}
      <label class="row">
        <span class="lbl" class:changed={dbg[p.key] !== DBG_DEFAULTS[p.key]}>{p.label}</span>
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
</style>
