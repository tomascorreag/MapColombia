<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import { ScatterplotLayer } from '@deck.gl/layers';
  import { DataFilterExtension } from '@deck.gl/extensions';
  import type { PickingInfo, Layer } from '@deck.gl/core';
  import type { ViolenceData, ElectionsData, Munis, ModalityMeta, Election } from './data';
  import { formatDay, formatInt } from './data';
  import { MODALITY_COLORS, hexToRgb } from './colors';
  import { app } from './state.svelte';
  import { t, ui, modalityName } from './i18n.svelte';

  let {
    violence,
    elections,
    munis,
  }: { violence: ViolenceData; elections: ElectionsData; munis: Munis } = $props();

  // Dev/MVP basemap: CARTO dark matter (attribution required). The production
  // plan (docs/stack-decision.md) is self-hosted PMTiles on R2.
  const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  let container: HTMLDivElement;
  let overlay: MapboxOverlay | null = null;
  let mapReady = $state(false);

  // One extension instance shared by all violence layers (deck dedupes shaders).
  const yearFilter = new DataFilterExtension({ filterSize: 1 });

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

  function electionPoints(e: Election): ElectionPoint[] {
    return e.m.map((mi, i) => {
      const party = elections.parties[e.p[i]];
      return {
        position: [munis.lon[mi], munis.lat[mi]],
        color: hexToRgb(party.color),
        radius: Math.sqrt(e.t[i]),
        muniIdx: mi,
        party: party.name,
        candidate: e.candidates && e.c ? e.candidates[e.c[i]] : null,
        w: e.w[i],
        t: e.t[i],
      };
    });
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

    const e = elections.bodies[app.body][app.electionIdx[app.body]];
    if (e) {
      layers.push(
        new ScatterplotLayer<ElectionPoint>({
          id: 'elections',
          visible: !isViolence,
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
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
    background: var(--ink);
  }
</style>
