<script lang="ts">
  import type { ViolenceData, ElectionsData, Munis, MuniShapes } from './lib/data';
  import { loadViolence, loadJson } from './lib/data';
  import { app } from './lib/state.svelte';
  import { t, ui } from './lib/i18n.svelte';
  import MapView from './lib/MapView.svelte';
  import TimeBar from './lib/TimeBar.svelte';
  import LegendViolence from './lib/LegendViolence.svelte';
  import LegendElections from './lib/LegendElections.svelte';
  import LegendMemoria from './lib/LegendMemoria.svelte';
  import Tooltip from './lib/Tooltip.svelte';
  import DebugPanel from './lib/DebugPanel.svelte';
  import { dbgEnabled } from './lib/debug.svelte';

  // $state.raw: loaded artifacts are immutable — deep reactive proxies over
  // megabytes of parsed JSON would register one signal per array element, and
  // every animation-frame state write would re-validate all of them (measured:
  // ~300 ms/frame in Svelte's is_dirty during memoria playback).
  let violence = $state.raw<ViolenceData | null>(null);
  let elections = $state.raw<ElectionsData | null>(null);
  let munis = $state.raw<Munis | null>(null);
  let shapes = $state.raw<MuniShapes | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    Promise.all([
      loadViolence(),
      loadJson<ElectionsData>('data/elections.json'),
      loadJson<Munis>('data/munis.json'),
      loadJson<MuniShapes>('data/munis_shapes.json'),
    ])
      .then(([v, e, m, sh]) => {
        // default each body to its most recent election
        for (const b of ['presidencia', 'senado', 'camara'] as const) {
          app.electionIdx[b] = e.bodies[b].length - 1;
        }
        violence = v;
        elections = e;
        munis = m;
        shapes = sh;
      })
      .catch((err: Error) => {
        error = err.message;
      });
  });

  function switchTab(tab: 'violence' | 'elections' | 'memoria') {
    app.tab = tab;
    app.playing = false;
    app.hover = null;
  }
</script>

{#if error}
  <div class="splash">
    <span class="eyebrow">{t('load_error')}</span>
    <p class="mono dim">{error}</p>
  </div>
{:else if !violence || !elections || !munis || !shapes}
  <div class="splash">
    <span class="eyebrow">{t('eyebrow')}</span>
    <h1>{t('title')}</h1>
    <p class="mono dim pulse">{t('loading')}</p>
  </div>
{:else}
  <main>
    <MapView {violence} {elections} {munis} {shapes} />

    <!-- header + legend share one flex rail so the panel always flows below
         the header, whatever height the current language wraps to -->
    <div class="rail">
      <header class="ficha rise" style="animation-delay: 0.05s">
      <div class="head-row">
        <div>
          <span class="eyebrow">{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p class="sub">{t('subtitle')}</p>
        </div>
        <button
          class="lang mono"
          onclick={() => (ui.lang = ui.lang === 'es' ? 'en' : 'es')}
          aria-label="Cambiar idioma / switch language"
        >
          {ui.lang === 'es' ? 'EN' : 'ES'}
        </button>
      </div>

      <div class="tabs">
        <button
          aria-pressed={app.tab === 'violence'}
          class:active={app.tab === 'violence'}
          onclick={() => switchTab('violence')}
        >
          {t('tab_violence')}
        </button>
        <button
          aria-pressed={app.tab === 'elections'}
          class:active={app.tab === 'elections'}
          onclick={() => switchTab('elections')}
        >
          {t('tab_elections')}
        </button>
        <button
          aria-pressed={app.tab === 'memoria'}
          class:active={app.tab === 'memoria'}
          onclick={() => switchTab('memoria')}
        >
          {t('tab_memoria')}
        </button>
      </div>
      </header>

      <aside class="ficha rise panel" style="animation-delay: 0.15s">
        {#if app.tab === 'violence'}
          <LegendViolence {violence} />
        {:else if app.tab === 'elections'}
          <LegendElections {elections} />
        {:else}
          <LegendMemoria {violence} />
        {/if}
      </aside>
    </div>

    <div class="ficha rise timebar-wrap" style="animation-delay: 0.25s">
      <TimeBar {violence} {elections} />
    </div>

    <Tooltip />

    {#if dbgEnabled && app.tab === 'memoria'}
      <DebugPanel />
    {/if}

    <footer class="mono">
      <span class="dim">{t('sources')}:</span>
      CNMH/SIEVCAC (corte 2026-03-31) · CEDE Resultados Electorales 1958–2022 (CC0) ·
      DIVIPOLA MinSalud (CC BY-SA)
    </footer>
  </main>
{/if}

<style>
  main {
    position: relative;
    height: 100%;
    overflow: hidden;
  }

  /* ---------- splash ---------- */
  .splash {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
  }

  .splash h1 {
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 600;
    margin: 0;
  }

  .pulse {
    animation: pulse 1.6s ease-in-out infinite;
    font-size: 11px;
    letter-spacing: 0.12em;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 0.9;
    }
  }

  /* ---------- left rail: header + legend in one flow ---------- */
  .rail {
    position: absolute;
    top: 18px;
    left: 18px;
    z-index: 10;
    width: 332px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    /* stay clear of the timebar at the bottom */
    max-height: calc(100vh - 140px);
  }

  header {
    flex: none;
    padding: 14px 16px 0;
  }

  .head-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  h1 {
    font-family: var(--font-display);
    font-size: 27px;
    font-weight: 600;
    line-height: 1.08;
    margin: 4px 0 2px;
  }

  .sub {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 12.5px;
    color: var(--paper-dim);
    margin: 0 0 10px;
  }

  .lang {
    flex: none;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--paper-dim);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    padding: 4px 8px;
  }

  .lang:hover {
    color: var(--gold);
    border-color: var(--gold);
  }

  /* ---------- tabs ---------- */
  .tabs {
    display: flex;
    gap: 22px;
    border-top: 1px solid var(--hairline-soft);
    margin: 0 -16px;
    padding: 0 16px;
  }

  .tabs button {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--paper-faint);
    padding: 11px 0 12px;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.15s;
  }

  .tabs button:hover {
    color: var(--paper-dim);
  }

  .tabs button.active {
    color: var(--paper);
    border-bottom-color: var(--gold);
  }

  /* ---------- side panel (flows below the header in the rail) ---------- */
  .panel {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--hairline) transparent;
  }

  /* ---------- time bar ---------- */
  .timebar-wrap {
    position: absolute;
    z-index: 10;
    left: 50%;
    transform: translateX(-50%);
    bottom: 22px;
    width: min(620px, calc(100vw - 420px));
  }

  /* ---------- footer ---------- */
  footer {
    position: absolute;
    z-index: 9;
    right: 10px;
    bottom: 2px;
    font-size: 9px;
    color: var(--paper-faint);
    background: rgba(11, 13, 17, 0.7);
    padding: 3px 8px;
    border-radius: 2px;
  }

  footer .dim {
    color: var(--gold);
  }

  /* ---------- small screens: stack, keep it usable ---------- */
  @media (max-width: 900px) {
    .rail {
      width: calc(100vw - 36px);
      max-height: calc(100vh - 150px);
    }

    .panel {
      max-height: 30vh;
    }

    .timebar-wrap {
      width: calc(100vw - 36px);
      bottom: 8px;
    }

    footer {
      display: none;
    }
  }
</style>
