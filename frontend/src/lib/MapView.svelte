<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import { GeoJsonLayer, LineLayer, ScatterplotLayer } from '@deck.gl/layers';
  import { DataFilterExtension, MaskExtension } from '@deck.gl/extensions';
  import type { PickingInfo, Layer } from '@deck.gl/core';
  import { TendrilExtension } from './TendrilExtension';
  import { LossRasterLayer, SPOT_DIM } from './LossRasterLayer';
  import { buildTendrils } from './tendrils';
  import type {
    ViolenceData,
    ElectionsData,
    Munis,
    MuniShapes,
    Election,
    DeforestationData,
    ShapeFeature,
  } from './data';
  import { formatDay, formatInt } from './data';
  import { MODALITY_COLORS, hexToRgb } from './colors';
  import { COLOR_BUCKET_DAYS } from './memoria';
  import { app, type Hover } from './state.svelte';
  import { dbg } from './debug.svelte';
  import { perf, PERF, startFpsGovernor } from './perf.svelte';
  import { t, ui, modalityName } from './i18n.svelte';
  import { muniLabel as fmtMuniLabel, responsible, abParticipants, abInitiative } from './eventFormat';

  let {
    violence,
    elections,
    munis,
    shapes,
    deforestation = null,
  }: {
    violence: ViolenceData;
    elections: ElectionsData;
    munis: Munis;
    shapes: MuniShapes;
    deforestation?: DeforestationData | null;
  } = $props();

  // Dev/MVP basemap: CARTO dark matter (attribution required). The production
  // plan (docs/stack-decision.md) is self-hosted PMTiles on R2.
  const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  let container: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let overlay: MapboxOverlay | null = null;
  let mapReady = $state(false);

  // Device-tier caps (docs in perf.svelte.ts): the dbg knobs stay the look's
  // source of truth, the tier mins/caps them so weak GPUs render a sparser,
  // lower-resolution version of the same scene. `P` changes at most twice per
  // session (governor demotions), each a one-time tendril-field rebuild.
  const P = $derived(PERF[perf.tier]);
  const dprCap = $derived(
    Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, P.dprCap)
  );

  // Last cursor position over the map canvas (deck pick coords), or null when
  // the pointer is off the map. Plain (non-reactive) let: read on demand to
  // re-pick the memoria tooltip as time advances during playback — deck's
  // onHover only fires on pointer movement, so a stationary cursor never
  // re-triggers it (see the re-pick effect at the bottom of the script).
  let lastPointer: { x: number; y: number } | null = null;

  // One extension instance shared by all violence layers (deck dedupes shaders).
  const yearFilter = new DataFilterExtension({ filterSize: 1 });
  // Hoisted like yearFilter: fresh extension instances per frame would
  // register as shader changes and rebuild pipelines every animation tick.
  const memoriaMask = new MaskExtension();
  const tendrilExt = new TendrilExtension();

  // Hoisted: a fresh parameters object per frame would register as a pipeline
  // change in luma.gl every animation tick.
  const ADDITIVE_BLEND = {
    blendColorOperation: 'add',
    blendColorSrcFactor: 'src-alpha',
    blendColorDstFactor: 'one',
    blendAlphaSrcFactor: 'one',
    blendAlphaDstFactor: 'one',
  } as const;

  // Per-modality binary data objects built ONCE and reused across effect runs.
  // deck.gl compares `props.data` by identity: a fresh object (or subarray) per
  // tick would invalidate and re-upload every GPU attribute on each scrub —
  // exactly what the filterRange design exists to avoid (docs/stack-decision.md).
  // Every event renders as a red wound/scar; the GPU filter value is the wound
  // day (exact date; -1 never flares) or, for scars, the year-close scar day.
  const woundDataByMod = $derived(
    violence.meta.modalities.map((m) => ({
      length: m.n,
      attributes: {
        getPosition: { value: violence.pos.subarray(m.start * 2, m.end * 2), size: 2 },
        getRadius: { value: violence.radius.subarray(m.start, m.end), size: 1 },
        getFilterValue: { value: violence.dayF32.subarray(m.start, m.end), size: 1 },
      },
    }))
  );
  const scarDataByMod = $derived(
    violence.meta.modalities.map((m) => ({
      length: m.n,
      attributes: {
        getPosition: { value: violence.pos.subarray(m.start * 2, m.end * 2), size: 2 },
        getRadius: { value: violence.radius.subarray(m.start, m.end), size: 1 },
        getFilterValue: { value: violence.scarDayF32.subarray(m.start, m.end), size: 1 },
      },
    }))
  );

  const modByCode = $derived(
    new Map(violence.meta.modalities.map((m) => [m.code, m]))
  );

  // One SHARED tendril field across every event type (plus a finer second field
  // for visual richness), seeded ∝ victims. Built at load and rebuilt only when
  // the debug panel commits a geometry param (slider release — see DebugPanel).
  // Toggling a modality is a uniform update (enabledMask), never a rebuild.
  const tendrilData = $derived.by(() =>
    buildTendrils(violence, violence.modOf, {
      seed: 0x1958,
      nCurves: Math.min(dbg.nCurves, P.curves1),
      stepKm: dbg.stepKm,
      reachKm: dbg.reachKm,
      noiseLen1: dbg.noiseLen1,
      noiseLen2: dbg.noiseLen2,
      noiseAmp1: dbg.noiseAmp1,
      noiseAmp2: dbg.noiseAmp2,
    })
  );
  const tendrilData2 = $derived.by(() =>
    buildTendrils(violence, violence.modOf, {
      seed: 0x77aa,
      nCurves: Math.min(dbg.t2Curves, P.curves2),
      stepKm: dbg.t2StepKm,
      reachKm: dbg.reachKm,
      noiseLen1: dbg.t2NoiseLen1,
      noiseLen2: dbg.t2NoiseLen2,
      noiseAmp1: dbg.t2NoiseAmp1,
      noiseAmp2: dbg.t2NoiseAmp2,
    })
  );
  // Live shader knobs (one uniform-block update per frame, no attribute work)
  const tendrilParams = $derived({
    fadeDays: dbg.fadeDays,
    reachKm: dbg.reachKm,
    pulseSpeedKmPerDay: dbg.pulseSpeed,
    pulseWidthKm: dbg.pulseWidth,
    widthBoost: dbg.widthBoost,
    widthFalloff: dbg.widthFalloff,
    scarWidth: dbg.scarWidth,
    scarAlpha: dbg.scarAlpha,
    freshAlpha: dbg.freshAlpha,
    pulseStrength: dbg.pulseStrength,
  });

  // Coarse sim-time bucket (~15 sim-days) used to throttle the hover-
  // suppression effect during playback — per-frame effect runs would be
  // wasted work while the wound uniforms animate smoothly.
  const colorBucket = $derived(Math.floor(app.mday / COLOR_BUCKET_DAYS));

  const muniLabel = (idx: number) => fmtMuniLabel(munis, idx);

  // Single-event detail card, built from a global event index so it can be
  // produced from a fresh re-pick (during playback) as well as a live hover.
  function violenceCard(gi: number, x: number, y: number): Hover {
    const m = violence.meta.modalities[violence.modOf[gi]];
    const exactDate = formatDay(violence.day[gi], ui.lang);
    const rows = [
      {
        label: t('date'),
        value: exactDate ?? `${violence.year[gi]} (${t('date_unknown_day')})`,
      },
      { label: t('municipality'), value: muniLabel(violence.muni[gi]) },
      { label: t('victims'), value: formatInt(violence.victims[gi], ui.lang) },
    ];
    if (m.code === 'AB') {
      // combat: show the participants + initiative, never a single "responsible"
      const parts = abParticipants(violence, gi);
      if (parts.length) rows.push({ label: t('participants'), value: parts.join(' · ') });
      const init = abInitiative(violence, gi, ui.lang);
      if (init) rows.push({ label: t('initiative'), value: init });
    } else {
      rows.push({ label: t('responsible'), value: responsible(violence, gi) });
    }
    rows.push({ label: t('record'), value: `N.º ${violence.id[gi]}` });
    return { x, y, accent: MODALITY_COLORS[m.code], title: modalityName(m.code), rows };
  }

  // Build the memoria tooltip by re-picking every enabled wound/scar layer at a
  // screen position. Decoupled from deck's hover event so it can run both on a
  // live hover and as time advances under a stationary cursor during playback
  // (deck's onHover only fires on pointer movement). A few px on screen can
  // cover many events at national zoom, so gather everything under the cursor
  // (fixed pixel radius — the covered ground area shrinks as the user zooms in)
  // and list them all. `hintGi`, when ≥ 0, is the directly-hovered event,
  // guaranteed to be included even if the multi-pick radius misses it.
  // Gather every event under a screen position (a few px cover many records at
  // national zoom), returned as global indices sorted newest-first — the most
  // recent events sit nearest the timeline position the user is looking at.
  // Within a year, day = -1 (exact day unknown) sorts after dated events.
  // `hintGi`, when ≥ 0, is the directly-picked event, guaranteed included even
  // if the multi-pick radius misses it. Shared by the hover card and the click
  // handler, so both surfaces list events in the same order.
  function gatherEventsAt(x: number, y: number, hintGi: number, depth: number): number[] {
    if (!overlay) return [];
    const layerIds: string[] = [];
    for (const mm of violence.meta.modalities) {
      if (app.enabled[mm.code]) layerIds.push(`wound-core-${mm.code}`, `scar-${mm.code}`);
    }
    const picks = overlay.pickMultipleObjects({ x, y, radius: 6, layerIds, depth });
    const seen = new Set<number>(); // global indices
    if (hintGi >= 0) seen.add(hintGi);
    for (const p of picks) {
      if (p.index < 0) continue;
      const code = (p.layer?.id ?? '').replace(/^(wound-core|scar)-/, '');
      const mm = modByCode.get(code);
      if (mm) seen.add(mm.start + p.index);
    }
    return [...seen].sort(
      (a, b) => violence.year[b] - violence.year[a] || violence.day[b] - violence.day[a]
    );
  }

  function memoriaPickAt(x: number, y: number, hintGi = -1) {
    if (!overlay) return;
    const idxs = gatherEventsAt(x, y, hintGi, P.hoverDepth);
    if (idxs.length === 0) {
      app.hover = null;
      return;
    }
    if (idxs.length === 1) {
      app.hover = violenceCard(idxs[0], x, y); // single event: full detail card
      return;
    }
    const MAX_ROWS = 6;
    const rows = idxs.slice(0, MAX_ROWS).map((gi) => ({
      label: formatDay(violence.day[gi], ui.lang) ?? String(violence.year[gi]),
      value: `${modalityName(violence.meta.modalities[violence.modOf[gi]].code)} · ${muniLabel(violence.muni[gi])} · ${formatInt(violence.victims[gi], ui.lang)} ${t('victims').toLowerCase()}`,
    }));
    if (idxs.length > MAX_ROWS) {
      rows.push({
        label: '…',
        value: `+${formatInt(idxs.length - MAX_ROWS, ui.lang)} ${t('n_more')}`,
      });
    }
    app.hover = {
      x,
      y,
      accent: 'rgb(255, 47, 64)',
      title: `${formatInt(idxs.length, ui.lang)} ${ui.lang === 'es' ? 'casos' : 'cases'}`,
      rows,
    };
  }

  // resolve the directly-picked event's global index from a wound/scar pick
  function pickedGi(info: PickingInfo): number {
    const code = (info.layer?.id ?? '').replace(/^(wound-core|scar)-/, '');
    const mm = modByCode.get(code);
    return mm ? mm.start + info.index : -1;
  }

  // deck hover entry for the wound/scar dot layers
  function woundHover(info: PickingInfo) {
    if (!info.picked || info.index < 0) {
      app.hover = null;
      return;
    }
    memoriaPickAt(info.x, info.y, pickedGi(info));
  }

  // deck click entry: pin every event under the click in the detail panel.
  // The deeper clickDepth only here — picking runs one render pass per depth
  // level over a small region, fine for a discrete click but too costly for
  // the hover path (memoriaPickAt fires on pointer movement and per colour
  // bucket), which keeps the shallower hoverDepth.
  function woundClick(info: PickingInfo) {
    if (!info.picked || info.index < 0) return;
    const idxs = gatherEventsAt(info.x, info.y, pickedGi(info), P.clickDepth);
    if (idxs.length === 0) return;
    app.hover = null;
    app.selected = idxs;
    app.selectedDay = app.mday; // snapshot for the panel's "hasta {month}" header
  }

  interface ElectionPoint {
    position: [number, number];
    color: [number, number, number];
    radius: number;
    muniIdx: number;
    party: string;
    candidate: string | null;
    w: number;
    t: number;
  }

  // Memoized per election rec: deck.gl compares props.data by identity, and
  // buildLayers now runs per animation frame on the memoria tab — a fresh
  // array here would force a full attribute regen every frame.
  const electionPointsCache = new WeakMap<Election, ElectionPoint[]>();

  function electionPoints(e: Election): ElectionPoint[] {
    const hit = electionPointsCache.get(e);
    if (hit) return hit;
    const pts = e.m.map((mi, i) => {
      const party = elections.parties[e.p[i]];
      return {
        position: [munis.lon[mi], munis.lat[mi]] as [number, number],
        color: hexToRgb(party.color),
        radius: Math.sqrt(e.t[i]),
        muniIdx: mi,
        party: party.name,
        candidate: e.candidates && e.c ? e.candidates[e.c[i]] : null,
        w: e.w[i],
        t: e.t[i],
      };
    });
    electionPointsCache.set(e, pts);
    return pts;
  }

  function electionHover(info: PickingInfo) {
    const d = info.object as ElectionPoint | undefined;
    if (!info.picked || !d) {
      app.hover = null;
      return;
    }
    const pct = d.t > 0 ? Math.round((d.w / d.t) * 100) : 0;
    const rows = [
      { label: t('party'), value: d.party },
      ...(d.candidate ? [{ label: t('candidate'), value: d.candidate }] : []),
      {
        label: t('votes'),
        value: `${formatInt(d.w, ui.lang)} ${t('of_votes')} ${formatInt(d.t, ui.lang)} (${pct}%)`,
      },
    ];
    app.hover = {
      x: info.x,
      y: info.y,
      accent: `rgb(${d.color.join(',')})`,
      title: muniLabel(d.muniIdx),
      rows,
    };
  }

  // muni index -> per-year loss row (ha), for the deforestation readout/tooltip
  const defLossByMuni = $derived.by(() => {
    const map = new Map<number, number[]>();
    if (deforestation) {
      deforestation.m.forEach((mi, i) => map.set(mi, deforestation.loss[i]));
    }
    return map;
  });

  // cumulative loss (ha) for a muni through the scrubbed year, plus that year's loss
  function defLossAt(muniIdx: number): { cum: number; yr: number } {
    const row = defLossByMuni.get(muniIdx);
    if (!row || !deforestation) return { cum: 0, yr: 0 };
    const upto = app.defYear - deforestation.years[0]; // index into the year array
    let cum = 0;
    for (let i = 0; i <= upto && i < row.length; i++) cum += row[i];
    return { cum, yr: upto >= 0 && upto < row.length ? row[upto] : 0 };
  }

  function defMuniHover(info: PickingInfo) {
    const f = info.object as ShapeFeature | undefined;
    const i = f?.properties?.i;
    if (!info.picked || i == null) {
      app.hover = null;
      return;
    }
    const { cum, yr } = defLossAt(i);
    app.hover = {
      x: info.x,
      y: info.y,
      accent: 'rgb(232, 130, 30)',
      title: muniLabel(i),
      rows: [
        {
          label: `${t('def_cumulative_to')} ${app.defYear}`,
          value: `${formatInt(Math.round(cum), ui.lang)} ${t('def_ha')}`,
        },
        {
          label: `${t('def_loss_in')} ${app.defYear}`,
          value: `${formatInt(Math.round(yr), ui.lang)} ${t('def_ha')}`,
        },
      ],
    };
  }

  function defMuniClick(info: PickingInfo) {
    const f = info.object as ShapeFeature | undefined;
    const i = f?.properties?.i;
    if (i == null) return;
    app.hover = null;
    app.defMuni = i;
  }

  function buildLayers(): Layer[] {
    const layers: Layer[] = [];

    // ---- deforestation: Hansen tree-cover-loss raster + muni pick targets ----
    if (app.tab === 'deforestation') {
      if (deforestation) {
        layers.push(
          new LossRasterLayer({
            id: 'loss-raster',
            image: deforestation.image,
            codesImage: deforestation.codesImage, // 2nd sampler: ag-kind / legality / coca
            bounds: deforestation.meta.display_raster.bounds_lnglat,
            maxYear: app.defPos - 2000, // float lossyear threshold → smooth crossfade
            // unified spotlight: which dimension+code the legend lens is hovering
            spotDim: app.defSpot.dim ? SPOT_DIM[app.defSpot.dim] : 0,
            spotCode: app.defSpot.code,
            // crisp codes — never blend a year/class into its neighbour at edges
            textureParameters: {
              minFilter: 'nearest',
              magFilter: 'nearest',
            },
            pickable: false,
          } as never)
        );
        // transparent municipio polygons: invisible fill, faint outline, but
        // pickable so click/hover resolve to a muni for the readout panel
        layers.push(
          new GeoJsonLayer({
            id: 'def-munis',
            data: shapes as unknown as GeoJSON.FeatureCollection,
            stroked: true,
            filled: true,
            getFillColor: [0, 0, 0, 0],
            getLineColor: [232, 130, 30, 22],
            lineWidthMinPixels: 0.4,
            pickable: true,
            onHover: defMuniHover,
            onClick: defMuniClick,
          })
        );
      }
      return layers;
    }

    const isMemoria = app.tab === 'memoria';
    const mods = violence.meta.modalities;
    const tDay = app.mday;
    const freshRange: [number, number] = [Math.max(-0.5, tDay - dbg.fadeDays), tDay];
    const softRange: [number, number] = [tDay - 30, tDay];

    // modality visibility packed into one bitmask: toggling a checkbox is a
    // single-int uniform update for the shared tendril field, never a rebuild.
    // (The wound/scar DOT layers are per-modality and toggle with `visible`.)
    const enabledMask = mods.reduce(
      (acc, m, i) => (app.enabled[m.code] ? acc | (1 << i) : acc),
      0
    );
    // one SHARED tendril field (+ a finer second one), drawn twice: a scar pass
    // (normal blend, uniform settled alpha) and a fresh pass (additive flare)
    // widthScale partially compensates the sparser curve pools on lower tiers
    const tendrilFieldList = [
      { id: 't1', data: tendrilData, width: dbg.baseWidth * P.widthScale },
      { id: 't2', data: tendrilData2, width: dbg.t2BaseWidth * P.widthScale },
    ];

    // ---- memoria: every event type as red wounds/scars/tendrils ----
    // Global z-order: mask, scar tendrils, scar dots (bottom), then fresh
    // tendrils, wound glow, wound core (top). Dot layers are always present and
    // toggled with `visible`; tendril layers are gated by the modality bitmask.
    layers.push(
      // country silhouette (union of muni polygons) rendered to the mask FBO,
      // not the screen; clips the tendrils to land
      new GeoJsonLayer({
        id: 'memoria-mask',
        visible: isMemoria,
        data: shapes as unknown as GeoJSON.FeatureCollection,
        operation: 'mask',
        stroked: false,
      })
    );

    // permanent scar tendrils (NORMAL blending): the settled scar state. Because
    // overlapping strands composite to one ceiling alpha, every scar reaches the
    // same intensity over time, no matter how many victims (how much blood) fell.
    for (const f of tendrilFieldList) {
      layers.push(
        new LineLayer({
          id: `${f.id}-scar`,
          visible: isMemoria && f.data.length > 0,
          data: f.data,
          getColor: [255, 58, 28, 255],
          getWidth: f.width,
          widthUnits: 'pixels',
          updateTriggers: { getWidth: f.width },
          extensions: [tendrilExt, memoriaMask],
          maskId: 'memoria-mask',
          tendrilTime: tDay,
          tendrilParams: { ...tendrilParams, enabledMask, scarMode: 1 },
        })
      );
    }

    // permanent scars: every event that has already happened stays marked
    for (const [i, m] of mods.entries()) {
      layers.push(
        new ScatterplotLayer({
          id: `scar-${m.code}`,
          visible: isMemoria && app.enabled[m.code],
          data: scarDataByMod[i],
          getFillColor: [96, 16, 22, dbg.scarDotAlpha],
          radiusUnits: 'meters',
          radiusScale: dbg.scarScale,
          radiusMinPixels: 1.6,
          radiusMaxPixels: 14,
          stroked: false,
          pickable: isMemoria,
          onHover: woundHover,
          onClick: woundClick,
          extensions: [yearFilter],
          filterRange: [-0.5, tDay] as [number, number],
        })
      );
    }

    // fresh blood tendrils (ADDITIVE): the transient flare that spreads from
    // each wound on its date with an outward pulse and fades over ~3 years;
    // dense/deadly wounds burn hotter. Same geometry as the scar pass above.
    for (const f of tendrilFieldList) {
      layers.push(
        new LineLayer({
          id: `${f.id}-fresh`,
          visible: isMemoria && f.data.length > 0,
          data: f.data,
          getColor: [255, 58, 28, 255],
          getWidth: f.width, // base; the shader scales it up at the wound centre
          widthUnits: 'pixels',
          updateTriggers: { getWidth: f.width },
          parameters: ADDITIVE_BLEND,
          extensions: [tendrilExt, memoriaMask],
          maskId: 'memoria-mask',
          tendrilTime: tDay,
          tendrilParams: { ...tendrilParams, enabledMask, scarMode: 0 },
        })
      );
    }

    // wound glow: additive blending makes overlapping wounds burn hotter
    for (const [i, m] of mods.entries()) {
      layers.push(
        new ScatterplotLayer({
          id: `glow-${m.code}`,
          visible: isMemoria && P.glow && app.enabled[m.code],
          data: woundDataByMod[i],
          getFillColor: [255, 58, 28, dbg.glowAlpha],
          radiusUnits: 'meters',
          radiusScale: dbg.glowScale,
          radiusMinPixels: 5,
          // overdraw is radius²·DPR² fragments per sprite, additive (no
          // early-z) — the tier cap is the main fill-rate lever
          radiusMaxPixels: Math.min(dbg.glowMaxPx, P.glowMaxPx),
          stroked: false,
          parameters: ADDITIVE_BLEND,
          extensions: [yearFilter],
          filterRange: freshRange,
          filterSoftRange: softRange,
        })
      );
    }

    // wound core: appears at full size on the exact date, then contracts and
    // fades over ~3 years (filterTransformSize/Color) into the scar beneath
    for (const [i, m] of mods.entries()) {
      layers.push(
        new ScatterplotLayer({
          id: `wound-core-${m.code}`,
          visible: isMemoria && app.enabled[m.code],
          data: woundDataByMod[i],
          getFillColor: [255, 47, 64, dbg.coreAlpha],
          radiusUnits: 'meters',
          radiusScale: dbg.coreScale,
          radiusMinPixels: 2.2,
          radiusMaxPixels: dbg.coreMaxPx,
          stroked: false,
          pickable: isMemoria,
          onHover: woundHover,
          onClick: woundClick,
          extensions: [yearFilter],
          filterRange: freshRange,
          filterSoftRange: softRange,
        })
      );
    }

    const e = elections.bodies[app.body][app.electionIdx[app.body]];
    if (e) {
      layers.push(
        new ScatterplotLayer<ElectionPoint>({
          id: 'elections',
          visible: app.tab === 'elections',
          data: electionPoints(e),
          getPosition: (d) => d.position,
          getFillColor: (d) => [...d.color, 235],
          getRadius: (d) => d.radius,
          radiusUnits: 'meters',
          radiusScale: 28,
          radiusMinPixels: 2.2,
          radiusMaxPixels: 22,
          stroked: true,
          getLineColor: [11, 13, 17, 200],
          lineWidthMinPixels: 0.8,
          pickable: true,
          onHover: electionHover,
        })
      );
    }
    return layers;
  }

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [-73.6, 4.4],
      zoom: 5.1,
      minZoom: 3.8,
      maxZoom: 13,
      attributionControl: { compact: true },
      pixelRatio: dprCap,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    overlay = new MapboxOverlay({ interleaved: false, layers: [], useDevicePixels: dprCap });
    map.addControl(overlay as unknown as maplibregl.IControl);
    map.on('load', () => {
      mapReady = true;
    });

    // Track the cursor in deck pick coords independently of deck's onHover (which
    // only fires on movement) so the memoria tooltip can be re-evaluated as time
    // advances during playback. The UI panels are absolutely-positioned siblings
    // of this container, so moving onto them fires pointerleave here — clearing
    // the position keeps the re-pick from resurrecting a tooltip over chrome.
    const onPointerMove = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onPointerLeave = () => {
      lastPointer = null;
    };
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);

    return () => {
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      overlay = null;
      map?.remove();
      map = null;
    };
  });

  $effect(() => {
    if (!mapReady || !overlay) return;
    overlay.setProps({ layers: buildLayers(), useDevicePixels: dprCap });
  });

  // basemap resolution follows governor demotions (deck's follows via the
  // setProps above; the construction-time values cover the common no-demotion
  // session)
  $effect(() => {
    if (mapReady) map?.setPixelRatio(dprCap);
  });

  // While memoria playback runs, sample frame times and demote the tier if
  // the device can't hold frame rate (one-way; persists across visits).
  $effect(() => {
    if (!(app.playing && app.tab === 'memoria') || !mapReady) return;
    return startFpsGovernor();
  });

  // Keep the memoria tooltip live while time is flowing. deck's onHover only
  // fires on pointer movement, so under a stationary cursor the events/field
  // beneath it change without the card refreshing. Re-pick at the last cursor
  // position each colour bucket (the granularity the choropleth updates at) so
  // the card tracks what is actually under the cursor instead of going stale.
  // Tier throttle: each re-pick is hoverDepth picking passes — skipped
  // entirely on 'low' (the tooltip still refreshes on pointer movement).
  $effect(() => {
    void colorBucket;
    if (P.repickBuckets === 0 || colorBucket % P.repickBuckets !== 0) return;
    if (app.playing && app.tab === 'memoria' && lastPointer) {
      memoriaPickAt(lastPointer.x, lastPointer.y);
    }
  });
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
    background: var(--ink);
  }
</style>
