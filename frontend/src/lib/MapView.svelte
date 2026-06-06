<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
  import { DataFilterExtension } from '@deck.gl/extensions';
  import type { PickingInfo, Layer } from '@deck.gl/core';
  import type {
    ViolenceData,
    ElectionsData,
    Munis,
    MuniShapes,
    ShapeFeature,
    ModalityMeta,
    Election,
  } from './data';
  import { formatDay, formatInt } from './data';
  import { MODALITY_COLORS, hexToRgb } from './colors';
  import {
    type MemoriaData,
    blendField,
    fieldColors,
    contributors,
    scoreColor,
    scoreLabel,
    WOUND_FADE_DAYS,
    COLOR_BUCKET_DAYS,
  } from './memoria';
  import { app } from './state.svelte';
  import { t, ui, modalityName, electionLabel } from './i18n.svelte';

  let {
    violence,
    elections,
    munis,
    memoria,
    shapes,
  }: {
    violence: ViolenceData;
    elections: ElectionsData;
    munis: Munis;
    memoria: MemoriaData;
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

  // Choropleth colours update on a coarse sim-time bucket (~15 sim-days), not
  // per frame — recomputing 1.1k blends and re-uploading polygon colours at
  // 60 fps would be wasted work while the wound uniforms animate smoothly.
  const colorBucket = $derived(Math.floor(app.mday / COLOR_BUCKET_DAYS));
  const fieldBlend = $derived.by(() =>
    blendField(memoria.bodies[app.mbody], colorBucket * COLOR_BUCKET_DAYS, munis.codes.length)
  );
  const fieldRGBA = $derived.by(() => fieldColors(fieldBlend, munis.codes.length));
  const fieldEpoch = $derived(`${app.mbody}:${colorBucket}`);

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

  function fieldHover(info: PickingInfo) {
    const f = info.object as ShapeFeature | undefined;
    if (!info.picked || !f || f.properties.i == null) {
      app.hover = null;
      return;
    }
    const mi = f.properties.i;
    const s = fieldBlend.score[mi];
    const rows = [];
    if (Number.isNaN(s)) {
      rows.push({ label: t('political_score'), value: t('no_data_yet') });
    } else {
      const sign = s > 0 ? '+' : '';
      rows.push({
        label: t('political_score'),
        value: `${sign}${s.toFixed(2)} · ${scoreLabel(s, ui.lang)}`,
      });
      rows.push({
        label: t('coverage'),
        // floor, not round: a muni dimmed by the <50% rule must never display "50 %"
        value: `${Math.floor(fieldBlend.cov[mi] * 100)} %`,
      });
      // same bucketed time the displayed field uses — exact-time weights would
      // disagree with the colours under the cursor
      const contrib = contributors(
        memoria.bodies[app.mbody],
        colorBucket * COLOR_BUCKET_DAYS,
        mi
      );
      if (contrib.length) {
        rows.push({
          label: t('based_on'),
          value: contrib
            .map((c) => `${electionLabel(c)} (${Math.round(c.weight * 100)} %)`)
            .join(', '),
        });
      }
    }
    const accent = Number.isNaN(s) ? '#6e6a5e' : `rgb(${scoreColor(s).join(',')})`;
    app.hover = { x: info.x, y: info.y, accent, title: muniLabel(mi), rows };
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

    // ---- memoria: political field + wounds/scars ----
    const tDay = app.mday;
    layers.push(
      new GeoJsonLayer({
        id: 'lr-field',
        visible: isMemoria,
        data: shapes as unknown as GeoJSON.FeatureCollection,
        getFillColor: (f) => {
          const i = (f as unknown as ShapeFeature).properties.i;
          if (i == null) return [26, 29, 36, 90];
          const o = i * 4;
          return [fieldRGBA[o], fieldRGBA[o + 1], fieldRGBA[o + 2], fieldRGBA[o + 3]];
        },
        updateTriggers: { getFillColor: fieldEpoch },
        stroked: true,
        getLineColor: [11, 13, 17, 160],
        lineWidthMinPixels: 0.5,
        pickable: isMemoria,
        onHover: fieldHover,
      }),
      // permanent scars: every massacre that has already happened stays marked
      new ScatterplotLayer({
        id: 'ma-scars',
        visible: isMemoria,
        data: scarData,
        getFillColor: [96, 16, 22, 165],
        radiusUnits: 'meters',
        radiusScale: 950,
        radiusMinPixels: 1.6,
        radiusMaxPixels: 14,
        stroked: false,
        pickable: isMemoria,
        onHover: (info: PickingInfo) => violenceHover(info, maMeta),
        extensions: [yearFilter],
        filterRange: [-0.5, tDay] as [number, number],
      }),
      // wound glow: additive blending makes overlapping massacres burn hotter
      new ScatterplotLayer({
        id: 'ma-wounds-glow',
        visible: isMemoria,
        data: woundData,
        getFillColor: [255, 58, 28, 80],
        radiusUnits: 'meters',
        radiusScale: 3400,
        radiusMinPixels: 5,
        radiusMaxPixels: 64,
        stroked: false,
        parameters: ADDITIVE_BLEND,
        extensions: [yearFilter],
        filterRange: [Math.max(-0.5, tDay - WOUND_FADE_DAYS), tDay] as [number, number],
        filterSoftRange: [tDay - 30, tDay] as [number, number],
      }),
      // wound core: appears at full size on the exact date, then contracts and
      // fades over ~3 years (filterTransformSize/Color) into the scar beneath
      new ScatterplotLayer({
        id: 'ma-wounds-core',
        visible: isMemoria,
        data: woundData,
        getFillColor: [255, 47, 64, 230],
        radiusUnits: 'meters',
        radiusScale: 1500,
        radiusMinPixels: 2.2,
        radiusMaxPixels: 30,
        stroked: false,
        pickable: isMemoria,
        onHover: (info: PickingInfo) => violenceHover(info, maMeta),
        extensions: [yearFilter],
        filterRange: [Math.max(-0.5, tDay - WOUND_FADE_DAYS), tDay] as [number, number],
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
