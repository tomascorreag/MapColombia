<script lang="ts">
  import type { ElectionsData, Body } from './data';
  import { formatInt } from './data';
  import { app } from './state.svelte';
  import { t, ui } from './i18n.svelte';

  let { elections }: { elections: ElectionsData } = $props();

  const BODIES: Body[] = ['presidencia', 'senado', 'camara'];

  const election = $derived(elections.bodies[app.body][app.electionIdx[app.body]]);

  // parties ranked by municipalities won in the selected election
  const ranking = $derived.by(() => {
    const counts = new Map<number, number>();
    for (const p of election.p) counts.set(p, (counts.get(p) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 9)
      .map(([idx, n]) => ({ ...elections.parties[idx], n }));
  });

  function shortName(name: string): string {
    return name.length > 36 ? name.slice(0, 34) + '…' : name;
  }
</script>

<div class="legend">
  <div class="bodies">
    {#each BODIES as b (b)}
      <button
        class="body mono"
        class:active={app.body === b}
        aria-pressed={app.body === b}
        onclick={() => {
          app.body = b;
          app.playing = false;
        }}
      >
        {t(b)}
      </button>
    {/each}
  </div>

  <span class="eyebrow">{t('winner_party')}</span>
  <ul>
    {#each ranking as p (p.name)}
      <li>
        <span class="dot" style:background={p.color}></span>
        <span class="name" title={p.name}>{shortName(p.name)}</span>
        <span class="n mono dim">{formatInt(p.n, ui.lang)}</span>
      </li>
    {/each}
  </ul>

  <hr class="rule" />

  <p class="note mono">
    {#if app.body === 'senado' && election.year >= 1991}
      {t('senate_note')}
    {/if}
    {t('consulados_note')}
  </p>
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

  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 3px 2px;
    font-size: 12px;
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .n {
    font-size: 11px;
  }

  .note {
    margin: 6px 0 0;
    font-size: 10px;
    line-height: 1.6;
    color: var(--paper-faint);
  }
</style>
