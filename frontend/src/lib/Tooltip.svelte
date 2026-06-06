<script lang="ts">
  import { app } from './state.svelte';

  // The UI panels occlude the map canvas without the pointer ever leaving it,
  // so deck.gl never reports !picked — clear any stale tooltip when the
  // pointer moves onto chrome.
  $effect(() => {
    const clear = (ev: PointerEvent) => {
      if (app.hover && (ev.target as Element | null)?.closest('.ficha:not(.tooltip)')) {
        app.hover = null;
      }
    };
    document.addEventListener('pointerover', clear);
    return () => document.removeEventListener('pointerover', clear);
  });

  // keep the card inside the viewport
  const pos = $derived.by(() => {
    if (!app.hover) return null;
    const { x, y } = app.hover;
    const w = 280;
    const flipX = x + w + 24 > window.innerWidth;
    const flipY = y + 180 > window.innerHeight;
    return {
      left: flipX ? x - w - 14 : x + 14,
      top: flipY ? y - 150 : y + 12,
    };
  });
</script>

{#if app.hover && pos}
  <div
    class="tooltip ficha"
    style:left="{pos.left}px"
    style:top="{pos.top}px"
    style:--accent-c={app.hover.accent}
  >
    <div class="title">{app.hover.title}</div>
    <dl>
      {#each app.hover.rows as row (row.label)}
        <dt class="mono">{row.label}</dt>
        <dd>{row.value}</dd>
      {/each}
    </dl>
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    z-index: 30;
    width: 280px;
    padding: 10px 12px 11px;
    pointer-events: none;
    border-left: 3px solid var(--accent-c);
  }

  .title {
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
  }

  dt {
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--paper-faint);
    align-self: baseline;
    padding-top: 2px;
  }

  dd {
    margin: 0;
    font-size: 11.5px;
    color: var(--paper);
  }
</style>
