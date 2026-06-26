<script lang="ts">
  import type {
    ViolenceData,
    ElectionsData,
    Munis,
    MuniShapes,
    ViolenceDetails,
    EventAnnotations,
    DeforestationData,
  } from './lib/data';
  import {
    loadViolence,
    loadViolenceDetails,
    loadAnnotations,
    loadJson,
    loadDeforestation,
  } from './lib/data';
  import { app } from './lib/state.svelte';
  import { t, ui, toggleLang } from './lib/i18n.svelte';
  import MapView from './lib/MapView.svelte';
  import TimeBar from './lib/TimeBar.svelte';
  import LegendMemoria from './lib/LegendMemoria.svelte';
  import LegendDeforestation from './lib/LegendDeforestation.svelte';
  import DeforestationReadout from './lib/DeforestationReadout.svelte';
  import Tooltip from './lib/Tooltip.svelte';
  import DetailPanel from './lib/DetailPanel.svelte';
  import DebugPanel from './lib/DebugPanel.svelte';
  import Credits from './lib/Credits.svelte';
  import EventStory from './lib/EventStory.svelte';
  import Welcome from './lib/Welcome.svelte';
  import { dbgEnabled } from './lib/debug.svelte';
  import { defDbg, defRamp, DEF_DBG_GROUPS, DEF_RAMP_LABELS } from './lib/defDebug.svelte';
  import { FIRE_DEFAULTS, RAMP_DEFAULTS } from './lib/LossRasterLayer';
  import {
    forestDbg,
    forestColors,
    FOREST_DBG_GROUPS,
    FOREST_COLOR_KEYS,
  } from './lib/forestDebug.svelte';
  import { FOREST_DEFAULTS, FOREST_COLORS } from './lib/ForestLayer';
  import { perf, PERF } from './lib/perf.svelte';

  // Low tier: drop the panels' backdrop blur — it re-samples the animating
  // map canvas every frame. The .no-blur fallback is a more opaque panel bg.
  $effect(() => {
    document.documentElement.classList.toggle('no-blur', !PERF[perf.tier].blur);
  });

  // $state.raw: loaded artifacts are immutable — deep reactive proxies over
  // megabytes of parsed JSON would register one signal per array element, and
  // every animation-frame state write would re-validate all of them (measured:
  // ~300 ms/frame in Svelte's is_dirty during memoria playback).
  let violence = $state.raw<ViolenceData | null>(null);
  let elections = $state.raw<ElectionsData | null>(null);
  let munis = $state.raw<Munis | null>(null);
  let shapes = $state.raw<MuniShapes | null>(null);
  let error = $state<string | null>(null);

  // URL flag: ?section=deforestation opens the deforestation view (mirrors the
  // existing ?tier/?lang/?debug query-param pattern; no path routing needed).
  const isDeforestation =
    new URLSearchParams(location.search).get('section') === 'deforestation';
  if (isDeforestation) {
    app.tab = 'deforestation';
    // open at the start of the Hansen window and auto-play (the welcome modal,
    // which otherwise starts playback on close, is suppressed on this view)
    app.defPos = 2001;
    app.playing = true;
  }

  // Hansen tree-cover-loss artifacts — only fetched when the deforestation view
  // is active, so violence visitors never pay for them. $state.raw (it holds an
  // ImageBitmap + typed rows that never need deep reactivity).
  let deforestation = $state.raw<DeforestationData | null>(null);
  let defRequested = false;
  $effect(() => {
    if (app.tab === 'deforestation' && !deforestation && !defRequested) {
      defRequested = true;
      loadDeforestation()
        .then((d) => (deforestation = d))
        .catch((err: Error) => (error = err.message));
    }
  });

  // First-visit onboarding: the welcome modal shows once (localStorage latch)
  // and stays reopenable via the "?" button. localStorage can throw in private
  // modes — degraded mode is "welcome shows every visit", acceptable.
  const WELCOME_KEY = 'mdv:welcome:v1';
  const firstVisit = (() => {
    try {
      return localStorage.getItem(WELCOME_KEY) !== '1';
    } catch {
      return true;
    }
  })();
  // Show the welcome modal on every page load (not just first visit). The
  // welcome copy is violence-specific, so skip it on the deforestation view.
  app.overlay = isDeforestation ? null : 'welcome';
  function closeWelcome() {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* private mode — modal will show again next visit */
    }
    if (firstVisit) app.playHint = true;
    app.overlay = null;
    app.playing = true;
  }

  // Victim-detail buffers are large (~9 MB) and only needed once a panel opens —
  // fetch them lazily the first time the user selects an event, never on initial
  // load. $state.raw for the same reason as the other artifacts.
  let details = $state.raw<ViolenceDetails | null>(null);
  let detailsRequested = false;
  $effect(() => {
    if (app.selected.length > 0 && violence && !detailsRequested) {
      detailsRequested = true;
      loadViolenceDetails(violence.meta)
        .then((d) => (details = d))
        .catch(() => (detailsRequested = false)); // allow a retry on next open
    }
  });

  // Curated "Read more…" annotations — tiny JSON, fetched lazily the first time
  // a panel opens (same trigger as details). Non-fatal: the button is an
  // enhancement, so a failed fetch leaves annotations null and simply hides it.
  let annotations = $state.raw<EventAnnotations | null>(null);
  let annotationsRequested = false;
  $effect(() => {
    if (app.selected.length > 0 && !annotationsRequested) {
      annotationsRequested = true;
      loadAnnotations()
        .then((a) => (annotations = a))
        .catch(() => (annotationsRequested = false)); // allow a retry on next open
    }
  });

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
    <MapView {violence} {elections} {munis} {shapes} {deforestation} />

    <!-- header + legend share one flex rail so the panel always flows below
         the header, whatever height the current language wraps to -->
    <div class="rail" class:wide={app.tab === 'deforestation'}>
      <header class="ficha rise" style="animation-delay: 0.05s">
      <div class="head-row">
        <div>
          <span class="eyebrow">{app.tab === 'deforestation' ? t('def_eyebrow') : t('eyebrow')}</span>
          <h1>{app.tab === 'deforestation' ? t('def_title') : t('title')}</h1>
          <p class="sub">{app.tab === 'deforestation' ? t('def_subtitle') : t('subtitle')}</p>
        </div>
        <div class="hbtns">
          <button
            class="lang mono"
            onclick={() => (app.overlay = 'welcome')}
            aria-label={t('about_btn')}
            title={t('about_btn')}
          >
            ?
          </button>
          <button
            class="lang mono"
            onclick={toggleLang}
            aria-label="Cambiar idioma / switch language"
          >
            {ui.lang === 'es' ? 'EN' : 'ES'}
          </button>
        </div>
      </div>
      </header>

      <aside class="ficha rise panel" style="animation-delay: 0.15s">
        {#if app.tab === 'deforestation'}
          {#if deforestation}
            <LegendDeforestation {deforestation} />
          {/if}
        {:else}
          <LegendMemoria {violence} />
        {/if}
      </aside>
    </div>

    <div class="ficha rise timebar-wrap" style="animation-delay: 0.25s">
      <TimeBar {violence} {elections} {deforestation} />
    </div>

    <Tooltip />
    {#if app.tab === 'deforestation'}
      {#if deforestation}
        <DeforestationReadout {deforestation} {munis} />
      {/if}
    {:else}
      <DetailPanel {violence} {munis} {details} {annotations} />
    {/if}

    {#if dbgEnabled && app.tab === 'memoria'}
      <DebugPanel />
    {/if}
    {#if dbgEnabled && app.tab === 'deforestation'}
      <DebugPanel
        store={defDbg}
        defaults={FIRE_DEFAULTS}
        groups={DEF_DBG_GROUPS}
        title="deforestation · debug"
        ramp={defRamp}
        rampDefaults={RAMP_DEFAULTS}
        rampLabels={DEF_RAMP_LABELS}
      />
      <DebugPanel
        store={forestDbg}
        defaults={FOREST_DEFAULTS}
        groups={FOREST_DBG_GROUPS}
        title="forest backdrop · debug"
        anchor="left"
        colors={forestColors}
        colorDefaults={FOREST_COLORS}
        colorKeys={FOREST_COLOR_KEYS}
      />
    {/if}

    <footer class="mono">
      <span class="dim">{t('sources')}:</span>
      {#if app.tab === 'deforestation'}
        Hansen/UMD GFC · IDEAM · DANE ·
      {:else}
        CNMH/SIEVCAC · CEDE · DANE · MinSalud ·
      {/if}
      <button class="credits-btn" onclick={() => (app.overlay = 'credits')}>
        {t('credits_btn')}
      </button>
    </footer>

    {#if app.overlay === 'credits'}
      <Credits onclose={() => (app.overlay = null)} />
    {/if}

    {#if app.overlay === 'story' && annotations && app.storyId !== null && annotations[String(app.storyId)]}
      <EventStory
        annotation={annotations[String(app.storyId)]}
        onclose={() => {
          app.overlay = null;
          app.storyId = null;
        }}
      />
    {/if}

    {#if app.overlay === 'welcome'}
      <Welcome onclose={closeWelcome} />
    {/if}
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
    /* extend to the bottom of the viewport (18px top + 18px bottom margin); the
       centered timebar is horizontally clear of this left column on desktop */
    max-height: calc(100vh - 36px);
  }

  /* deforestation legend is denser — give it ~20% more width */
  .rail.wide {
    width: 398px;
  }

  header {
    flex: none;
    padding: 14px 16px 4px;
  }

  .head-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .hbtns {
    flex: none;
    display: flex;
    gap: 6px;
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
    /* center via auto margins, not transform: the .rise entrance animation
       animates `transform` with fill-mode both, so a translateX(-50%) here
       gets clobbered by the animation's final translateY(0) and the box ends
       up shifted right by half its width */
    left: 0;
    right: 0;
    margin-inline: auto;
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

  .credits-btn {
    font: inherit;
    color: var(--paper-dim);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .credits-btn:hover {
    color: var(--gold);
  }

  /* ---------- small screens: stack, keep it usable ---------- */
  @media (max-width: 900px) {
    .rail,
    .rail.wide {
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

    /* keep attribution reachable on small screens (license requirement);
       drop only the "Fuentes:" label */
    footer {
      right: 4px;
      bottom: 0;
    }

    footer .dim {
      display: none;
    }
  }
</style>
