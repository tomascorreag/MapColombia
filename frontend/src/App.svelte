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
  import Landing from './lib/Landing.svelte';
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

  // URL flag drives which view renders (mirrors the existing ?tier/?lang/?debug
  // query-param pattern; no path routing — works on GH Pages project sites where
  // a path would 404). `null` (plain `/` or an unknown value) => the landing
  // page, the gateway to both archives. Both archives are gated behind a flag so
  // they share one front door.
  type Section = 'violence' | 'deforestation';
  function readSection(): Section | null {
    const s = new URLSearchParams(location.search).get('section');
    return s === 'deforestation' || s === 'violence' ? s : null;
  }
  const section = readSection();
  const isDeforestation = section === 'deforestation';

  // Cinematic arrival: an archive view fades in from black on every load (paired
  // with the landing's fade-to-black on click, and masking the map's first
  // paint). The OS reduce-motion pref is IGNORED site-wide (owner decision), so
  // the arrival fade runs for everyone; see the disabled clamp in app.css and the
  // matching pinned guard in Landing.svelte — restore all three together.
  const reduceMotion = false;
  const introFade = section !== null && !reduceMotion;

  // neutral tab/title on the landing; per-view title otherwise
  document.title =
    section === 'deforestation'
      ? 'Cenizas de muerte · Colombia 2001–2025'
      : section === 'violence'
        ? 'Cicatrices de violencia · Colombia 1958–2026'
        : 'Colombia · dos archivos de la pérdida';

  if (isDeforestation) {
    app.tab = 'deforestation';
    // open at the start of the Hansen window and auto-play (this view has no
    // blocking welcome modal). Playback holds until the arrival veil has fully
    // lifted (0.7 s + 0.06 s delay) — otherwise the opening beat, the first
    // years igniting, elapses hidden behind black.
    app.defPos = 2001;
    if (introFade) setTimeout(() => (app.playing = true), 800);
    else app.playing = true;
  }

  // Hansen tree-cover-loss artifacts — fetched only on the deforestation page
  // (see the per-section load below). $state.raw (it holds an ImageBitmap +
  // typed rows that never need deep reactivity).
  let deforestation = $state.raw<DeforestationData | null>(null);

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
  // The modal auto-shows only on the FIRST violence visit — the landing now does
  // the framing job, and a returning visitor shouldn't clear two doors before the
  // map. It stays reopenable via "?" on either archive (tab-aware copy).
  app.overlay = section === 'violence' && firstVisit ? 'welcome' : null;
  if (section === 'violence' && !firstVisit) app.playing = true;
  function closeWelcome() {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* private mode — modal will show again next visit */
    }
    app.overlay = null;
    // playback auto-start + the play-button hint are the violence-view arrival
    // choreography; a "?"-opened modal on deforestation must not touch playback
    if (app.tab !== 'deforestation') {
      if (firstVisit) app.playHint = true;
      app.playing = true;
    }
  }

  // ---- responsive chrome ----
  // Stacked layout (<=900px, phones and portrait tablets): header, legend and
  // timebar would otherwise share the height with the map, and on a phone the
  // three of them left no map at all. So the legend collapses behind a header
  // button, and the map is told the chrome insets so it can fit the country
  // between them (MapView). matchMedia rather than a resize listener: one
  // boolean flip per layout switch, no per-resize work.
  const STACKED = '(max-width: 900px)';
  let stacked = $state(typeof matchMedia === 'function' ? matchMedia(STACKED).matches : false);
  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(STACKED);
    const sync = () => (stacked = mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
  let legendOpen = $state(false);
  const showLegend = $derived(!stacked || legendOpen);

  // The timebar owns the bottom band; the rail and the click panels cap their
  // height above it (`--timebar-h` in the stylesheets). Its height moves with
  // the tab, the language and how the readout row wraps, so it is measured, not
  // authored. The same measurement feeds the map's fit insets.
  let mainEl: HTMLElement | undefined = $state();
  let railEl: HTMLElement | undefined = $state();
  let timebarEl: HTMLElement | undefined = $state();
  let chrome = $state<{ top: number; bottom: number } | null>(null);
  $effect(() => {
    const main = mainEl;
    const rail = railEl;
    const tb = timebarEl;
    if (!main || !rail || !tb) return;
    const sync = () => {
      const h = tb.offsetHeight;
      main.style.setProperty('--timebar-h', `${h}px`);
      // offsetTop/offsetHeight: untransformed layout, so the `rise` entrance
      // (which translates the boxes) can't be measured mid-flight
      chrome = { top: rail.offsetTop + rail.offsetHeight, bottom: h + 40 };
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(rail);
    ro.observe(tb);
    return () => ro.disconnect();
  });

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

  // Each page loads only what it renders: munis + shapes are shared (labels,
  // outlines, CPU picking); the violence page adds violence.bin, the
  // deforestation page adds the Hansen artifacts. elections.json is not
  // fetched anywhere — the elections tab is unreachable (no tab switcher, its
  // legend is not mounted), so it was ~1.4 MB of dead weight on every visit;
  // the dormant layer/strip code stays behind null guards. The landing page
  // renders no map and fetches nothing (smoke-landing.mjs gates that).
  $effect(() => {
    if (section === null) return;
    const shared = Promise.all([
      loadJson<Munis>('data/munis.json'),
      loadJson<MuniShapes>('data/munis_shapes.json'),
    ]);
    const own = isDeforestation ? loadDeforestation() : loadViolence();
    Promise.all([shared, own])
      .then(([[m, sh], d]) => {
        munis = m;
        shapes = sh;
        if (isDeforestation) deforestation = d as DeforestationData;
        else violence = d as ViolenceData;
      })
      .catch((err: Error) => {
        error = err.message;
      });
  });

</script>

{#if section === null}
  <Landing />
{:else if error}
  <div class="splash">
    <span class="eyebrow">{t('load_error')}</span>
    <p class="mono dim">{error}</p>
  </div>
{:else if !munis || !shapes || (isDeforestation ? !deforestation : !violence)}
  <div class="splash">
    <span class="eyebrow">{t('eyebrow')}</span>
    <h1>{t('title')}</h1>
    <p class="mono dim pulse">{t('loading')}</p>
  </div>
{:else}
  <main bind:this={mainEl}>
    <MapView {violence} {elections} {munis} {shapes} {deforestation} {stacked} {chrome} />

    <!-- header + legend share one flex rail so the panel always flows below
         the header, whatever height the current language wraps to -->
    <div class="rail" class:wide={app.tab === 'deforestation'} bind:this={railEl}>
      <header class="ficha rise" style="animation-delay: 0.05s">
      <div class="head-row">
        <div>
          <span class="eyebrow">{app.tab === 'deforestation' ? t('def_eyebrow') : t('eyebrow')}</span>
          <h1>{app.tab === 'deforestation' ? t('def_title') : t('title')}</h1>
          <p class="sub">{app.tab === 'deforestation' ? t('def_subtitle') : t('subtitle')}</p>
        </div>
        <div class="hbtns">
          <button
            class="lang mono legend-toggle"
            onclick={() => (legendOpen = !legendOpen)}
            aria-expanded={legendOpen}
          >
            {t('legend_btn')}
          </button>
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

      {#if showLegend}
        <aside class="ficha rise panel" style="animation-delay: 0.15s">
          {#if app.tab === 'deforestation'}
            {#if deforestation}
              <LegendDeforestation {deforestation} />
            {/if}
          {:else if violence}
            <LegendMemoria {violence} />
          {/if}
        </aside>
      {/if}
    </div>

    <div class="ficha rise timebar-wrap" style="animation-delay: 0.25s" bind:this={timebarEl}>
      <TimeBar {violence} {elections} {deforestation} />
    </div>

    <Tooltip />
    {#if app.tab === 'deforestation'}
      {#if deforestation}
        <DeforestationReadout {deforestation} {munis} />
      {/if}
    {:else if violence}
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
      <span class="srcs">
        {#if app.tab === 'deforestation'}
          Hansen/UMD GFC · IDEAM · DANE ·
        {:else}
          CNMH/SIEVCAC · CEDE · DANE · MinSalud ·
        {/if}
      </span>
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
      <Welcome
        variant={app.tab === 'deforestation' ? 'deforestation' : 'violence'}
        onclose={closeWelcome}
      />
    {/if}
  </main>
{/if}

<!-- fade-from-black arrival: sits above everything and dissolves on load,
     continuing the landing's fade-to-black into one uninterrupted cut -->
{#if introFade}
  <div class="intro-veil" aria-hidden="true"></div>
{/if}

<style>
  main {
    position: relative;
    height: 100%;
    overflow: hidden;
    /* the timebar's offset from the bottom edge — one number the timebar,
       the rail and both click panels (they inherit it) all read, so the
       caps above the band track it when a media query moves the band */
    --timebar-bottom: 22px;
  }

  /* ---------- fade-from-black arrival veil ---------- */
  .intro-veil {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: #000;
    pointer-events: none;
    animation: introFadeOut 0.7s ease 0.06s both;
  }
  @keyframes introFadeOut {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      visibility: hidden;
    }
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
    /* The bottom band belongs to the timebar: cap the rail above it. The
       centred timebar is horizontally clear of this column only above ~1470px
       (it is 620px wide, centred, and the rail is 332/398px), so between 900px
       and that the two overlapped by up to 200px and the legend's tail sat
       under the histogram. `--timebar-h` is measured by the script (the box
       varies with tab/language/wrapping); the fallback covers the first frame.
       Percentages, not vh: <main> is height:100% of the layout viewport, which
       on phones is the visible area, whereas 100vh includes the URL bar. */
    max-height: calc(100% - 18px - var(--timebar-h, 180px) - var(--timebar-bottom, 22px) - 10px);
  }

  /* stacked layouts only: the legend collapses behind this button */
  .legend-toggle {
    display: none;
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
    bottom: var(--timebar-bottom);
    width: min(620px, calc(100vw - 420px));
  }

  /* ---------- footer ---------- */
  /* bottom-LEFT: bottom-right is MapLibre's attribution control, and the two
     overlapped at every width (the footer ran under the expanded attribution
     text). The rail is capped above the timebar band, so this corner is free. */
  footer {
    position: absolute;
    z-index: 9;
    left: 18px;
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
      width: calc(100% - 36px);
      /* header + (opened) legend may take at most ~60% of the height; the map
         keeps the rest above the timebar */
      max-height: min(62%, calc(100% - var(--timebar-h, 180px) - var(--timebar-bottom, 36px) - 28px));
    }

    .legend-toggle {
      display: inline-block;
    }

    h1 {
      font-size: 22px;
    }

    header {
      padding: 12px 14px 2px;
    }

    .timebar-wrap {
      width: calc(100% - 36px);
      /* --timebar-bottom (36px, set above) clears the footer (bottom 0, 19px)
         and the attribution button (24px + 10px margin) which both sit under it */
    }

    /* The bottom strip is shared with MapLibre's attribution, which opens
       expanded (~256px) until the first map interaction: on one phone-wide
       line the two texts collide, so only the credits link stays — it opens
       the modal that carries every source and license in full. */
    footer {
      left: 4px;
      bottom: 0;
      max-width: calc(100% - 270px);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    footer .dim,
    footer .srcs {
      display: none;
    }
  }

  /* below ~1100px the centred timebar reaches under MapLibre's attribution
     (bottom-right, expanded until the first map interaction): lift it clear */
  @media (max-width: 1100px) {
    main {
      --timebar-bottom: 36px;
    }
  }

  /* short viewports (phones in landscape): the header's subtitle goes, the
     title tightens — the map needs the rows more than the strapline */
  @media (max-width: 900px) and (max-height: 520px) {
    .sub {
      display: none;
    }

    h1 {
      font-size: 18px;
      margin: 2px 0 6px;
    }
  }
</style>
