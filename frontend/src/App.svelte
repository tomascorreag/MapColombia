<script lang="ts">
  // Shell loaded by every page. The landing is bundled here; the archives
  // (MapLibre + deck.gl, ~90% of the JS) are a separate chunk imported only when
  // ?section= names one, so the front door never downloads the map stack.
  import Landing from './lib/Landing.svelte';
  import { t } from './lib/i18n.svelte';
  import { readSection, preloadArchiveData } from './lib/section';

  const section = readSection();

  // neutral tab/title on the landing; per-view title otherwise
  document.title =
    section === 'deforestation'
      ? 'Cenizas de muerte · Colombia 2001–2025'
      : section === 'violence'
        ? 'Cicatrices de violencia · Colombia 1958–2026'
        : 'Colombia · dos archivos de la pérdida';

  // data first, then the chunk: both requests are then in flight together
  if (section !== null) preloadArchiveData(section);
  const archive = section !== null ? import('./Archive.svelte') : null;
</script>

{#if section === null}
  <Landing />
{:else if archive}
  {#await archive}
    <!-- same black as the archive's loading veil, which takes over on mount -->
    <div class="pre-veil"></div>
  {:then { default: Archive }}
    <Archive />
  {:catch err}
    <div class="pre-veil failed" role="status">
      <span class="eyebrow">{t('load_error')}</span>
      <p class="mono dim">{String(err?.message ?? err)}</p>
    </div>
  {/await}
{/if}

<style>
  .pre-veil {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: #000;
  }

  .failed {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
  }
</style>
