<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import { GeoJsonLayer, LineLayer, ScatterplotLayer } from '@deck.gl/layers';
  import { DataFilterExtension, MaskExtension } from '@deck.gl/extensions';
  import type { PickingInfo, Layer } from '@deck.gl/core';
  import { TendrilExtension } from './TendrilExtension';
  import { buildTendrils } from './tendrils';
  import type {
    ViolenceData,
    ElectionsData,
    Munis,
    MuniShapes,
    ModalityMeta,
    Election,
  } from './data';
  import { formatDay, formatInt } from './data';
  import { MODALITY_COLORS, hexToRgb } from './colors';
  import { COLOR_BUCKET_DAYS } from './memoria';
  import { app } from './state.svelte';
  import { dbg } from './debug.svelte';
  import { t, ui, modalityName } from './i18n.svelte';

  let {
    violence,
    elections,
    munis,
    shapes,
  }: {
    violence: ViolenceData;
    elections: ElectionsData;
    munis: Munis;
    shapes: MuniShapes;
  } = $props();

  // Dev/MVP basemap: CARTO dark matter (attribution required). The production
  // plan (docs/stack-decision.md) is self-hosted PMTiles on R2.
  const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  let container: HTMLDivElement;
  let overlay: MapboxOverlay | null = null;
  let mapReady = $state(false);

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
  const violenceData = $derived(
    violence.meta.modalities.map((m) => ({
      length: m.end - m.start,
      attributes: {
        getPosition: { value: violence.pos.subarray(m.start * 2, m.end * 2), size: 2 },
        getRadius: { value: violence.radius.subarray(m.start, m.end), size: 1 },
        getFilterValue: { value: violence.yearF32.subarray(m.start, m.end), size: 1 },
      },
    }))
  );

  // Memoria: massacre slice (modalities[0]) with day-resolution filter values.
  // Same identity rule — built once, filterRange uniforms do the animation.
  // Slices use maMeta.start/end (start is 0 today, but the layout contract is
  // the meta offsets, not the modality order).
  const maMeta = $derived(violence.meta.modalities[0]);
  const woundData = $derived({
    length: maMeta.n,
    attributes: {
      getPosition: { value: violence.pos.subarray(maMeta.start * 2, maMeta.end * 2), size: 2 },
      getRadius: { value: violence.radius.subarray(maMeta.start, maMeta.end), size: 1 },
      getFilterValue: { value: violence.maDayF32, size: 1 },
    },
  });
  const scarData = $derived({
    length: maMeta.n,
    attributes: {
      getPosition: { value: violence.pos.subarray(maMeta.start * 2, maMeta.end * 2), size: 2 },
      getRadius: { value: violence.radius.subarray(maMeta.start, maMeta.end), size: 1 },
      getFilterValue: { value: violence.maScarDayF32, size: 1 },
    },
  });

  // Static memoria geometry, built at load and rebuilt when the debug panel
  // commits a geometry param (slider release only — see DebugPanel). Two
  // decorrelated fields: a broad primary field and a finer detail field.
  const tendrilData = $derived.by(() =>
    buildTendrils(violence, maMeta, {
      seed: 0x1958,
      nCurves: dbg.nCurves,
      stepKm: dbg.stepKm,
      reachKm: dbg.reachKm,
      noiseLen1: dbg.noiseLen1,
      noiseLen2: dbg.noiseLen2,
      noiseAmp1: dbg.noiseAmp1,
      noiseAmp2: dbg.noiseAmp2,
    })
  );
  const tendrilData2 = $derived.by(() =>
    buildTendrils(violence, maMeta, {
      seed: 0x77aa,
      nCurves: dbg.t2Curves,
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

  function muniLabel(idx: number): string {
    if (idx === 0xffff) return t('unknown');
    return `${munis.names[idx]}, ${munis.depts[idx]}`;
  }

  function violenceHover(info: PickingInfo, m: ModalityMeta) {
    if (!info.picked || info.index < 0) {
      app.hover = null;
      return;
    }
    const gi = m.start + info.index;
    const exactDate = formatDay(violence.day[gi], ui.lang);
    const cat = violence.meta.respCategories[violence.cat[gi]];
    const grp = violence.meta.respGroups[violence.grp[gi]];
    const resp = grp && grp !== 'NO IDENTIFICADO' && grp !== 'NO APLICA' ? `${cat} · ${grp}` : cat;
    app.hover = {
      x: info.x,
      y: info.y,
      accent: MODALITY_COLORS[m.code],
      title: modalityName(m.code),
      rows: [
        {
          label: t('date'),
          value: exactDate ?? `${violence.year[gi]} (${t('date_unknown_day')})`,
        },
        { label: t('municipality'), value: muniLabel(violence.muni[gi]) },
        { label: t('victims'), value: formatInt(violence.victims[gi], ui.lang) },
        { label: t('responsible'), value: resp },
        { label: t('record'), value: `N.º ${violence.id[gi]}` },
      ],
    };
  }

  // Memoria wound/scar hover: a few px on screen can cover many massacres at
  // national zoom, so gather everything under the cursor (fixed pixel radius —
  // the covered ground area shrinks as the user zooms in) and list them all.
  function memoriaWoundHover(info: PickingInfo) {
    if (!info.picked || info.index < 0 || !overlay) {
      app.hover = null;
      return;
    }
    const picks = overlay.pickMultipleObjects({
      x: info.x,
      y: info.y,
      radius: 6,
      layerIds: ['ma-scars', 'ma-wounds-core'],
      depth: 12,
    });
    const seen = new Set<number>();
    for (const p of picks) if (p.index >= 0) seen.add(p.index);
    if (seen.size <= 1) {
      violenceHover(info, maMeta); // single massacre: full detail card
      return;
    }
    const idxs = [...seen]
      .map((i) => maMeta.start + i)
      .sort((a, b) => violence.year[a] - violence.year[b] || violence.day[a] - violence.day[b]);
    const MAX_ROWS = 6;
    const rows = idxs.slice(0, MAX_ROWS).map((gi) => ({
      label: formatDay(violence.day[gi], ui.lang) ?? String(violence.year[gi]),
      value: `${muniLabel(violence.muni[gi])} · ${formatInt(violence.victims[gi], ui.lang)} ${t('victims').toLowerCase()}`,
    }));
    if (idxs.length > MAX_ROWS) {
      rows.push({
        label: '…',
        value: `+${formatInt(idxs.length - MAX_ROWS, ui.lang)} ${t('n_more')}`,
      });
    }
    app.hover = {
      x: info.x,
      y: info.y,
      accent: MODALITY_COLORS[maMeta.code],
      title: `${formatInt(idxs.length, ui.lang)} ${modalityName(maMeta.code).toLowerCase()}`,
      rows,
    };
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

  function buildLayers(): Layer[] {
    const layers: Layer[] = [];
    const isViolence = app.tab === 'violence';
    const isMemoria = app.tab === 'memoria';
    const range: [number, number] = app.allYears
      ? [violence.meta.yearMin, violence.meta.yearMax]
      : [app.year, app.year];

    for (const [i, m] of violence.meta.modalities.entries()) {
      layers.push(
        new ScatterplotLayer({
          id: `v-${m.code}`,
          visible: isViolence && app.enabled[m.code],
          data: violenceData[i],
          getFillColor: [...hexToRgb(MODALITY_COLORS[m.code]), 185],
          radiusUnits: 'meters',
          radiusScale: 900,
          radiusMinPixels: 1.7,
          radiusMaxPixels: 16,
          stroked: false,
          pickable: true,
          onHover: (info: PickingInfo) => violenceHover(info, m),
          extensions: [yearFilter],
          filterRange: range,
        })
      );
    }

    // ---- memoria: wounds/scars ----
    const tDay = app.mday;
    layers.push(
      // country silhouette (union of muni polygons) rendered to the mask FBO,
      // not the screen; clips the tendrils to land
      new GeoJsonLayer({
        id: 'memoria-mask',
        visible: isMemoria,
        data: shapes as unknown as GeoJSON.FeatureCollection,
        operation: 'mask',
        stroked: false,
      }),
      // permanent scars: every massacre that has already happened stays marked
      new ScatterplotLayer({
        id: 'ma-scars',
        visible: isMemoria,
        data: scarData,
        getFillColor: [96, 16, 22, dbg.scarDotAlpha],
        radiusUnits: 'meters',
        radiusScale: dbg.scarScale,
        radiusMinPixels: 1.6,
        radiusMaxPixels: 14,
        stroked: false,
        pickable: isMemoria,
        onHover: memoriaWoundHover,
        extensions: [yearFilter],
        filterRange: [-0.5, tDay] as [number, number],
      }),
      // blood tendrils: static flow-field curves, invisible before their
      // massacre; the shader makes them flare bright and thick at the wound
      // (tapering to 0 with distance) with an outward pulse, then settle into
      // a permanent dark scar state — all from the time uniform
      new LineLayer({
        id: 'ma-tendrils',
        visible: isMemoria,
        data: tendrilData,
        getColor: [255, 58, 28, 255],
        getWidth: dbg.baseWidth, // base; the shader scales it up at the wound centre
        widthUnits: 'pixels',
        updateTriggers: { getWidth: dbg.baseWidth },
        parameters: ADDITIVE_BLEND,
        extensions: [tendrilExt, memoriaMask],
        maskId: 'memoria-mask',
        tendrilTime: tDay,
        tendrilParams,
      }),
      // second, finer tendril field (own seed/noise): breaks the visual
      // regularity of a single flow field; same shader and time uniforms
      new LineLayer({
        id: 'ma-tendrils-2',
        visible: isMemoria && dbg.t2Curves > 0,
        data: tendrilData2,
        getColor: [255, 58, 28, 255],
        getWidth: dbg.t2BaseWidth,
        widthUnits: 'pixels',
        updateTriggers: { getWidth: dbg.t2BaseWidth },
        parameters: ADDITIVE_BLEND,
        extensions: [tendrilExt, memoriaMask],
        maskId: 'memoria-mask',
        tendrilTime: tDay,
        tendrilParams,
      }),
      // wound glow: additive blending makes overlapping massacres burn hotter
      new ScatterplotLayer({
        id: 'ma-wounds-glow',
        visible: isMemoria,
        data: woundData,
        getFillColor: [255, 58, 28, dbg.glowAlpha],
        radiusUnits: 'meters',
        radiusScale: dbg.glowScale,
        radiusMinPixels: 5,
        radiusMaxPixels: dbg.glowMaxPx,
        stroked: false,
        parameters: ADDITIVE_BLEND,
        extensions: [yearFilter],
        filterRange: [Math.max(-0.5, tDay - dbg.fadeDays), tDay] as [number, number],
        filterSoftRange: [tDay - 30, tDay] as [number, number],
      }),
      // wound core: appears at full size on the exact date, then contracts and
      // fades over ~3 years (filterTransformSize/Color) into the scar beneath
      new ScatterplotLayer({
        id: 'ma-wounds-core',
        visible: isMemoria,
        data: woundData,
        getFillColor: [255, 47, 64, dbg.coreAlpha],
        radiusUnits: 'meters',
        radiusScale: dbg.coreScale,
        radiusMinPixels: 2.2,
        radiusMaxPixels: dbg.coreMaxPx,
        stroked: false,
        pickable: isMemoria,
        onHover: memoriaWoundHover,
        extensions: [yearFilter],
        filterRange: [Math.max(-0.5, tDay - dbg.fadeDays), tDay] as [number, number],
        filterSoftRange: [tDay - 30, tDay] as [number, number],
      })
    );

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
    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [-73.6, 4.4],
      zoom: 5.1,
      minZoom: 3.8,
      maxZoom: 13,
      attributionControl: { compact: true },
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    map.on('load', () => {
      mapReady = true;
    });

    return () => {
      overlay = null;
      map.remove();
    };
  });

  $effect(() => {
    if (!mapReady || !overlay) return;
    overlay.setProps({ layers: buildLayers() });
  });

  // Tooltips are suppressed while memoria time is flowing: the field under a
  // stationary cursor keeps changing, so a pinned card would silently show
  // score/coverage from the hover instant. Pause to inspect.
  $effect(() => {
    void colorBucket;
    if (app.playing && app.tab === 'memoria' && app.hover) app.hover = null;
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
